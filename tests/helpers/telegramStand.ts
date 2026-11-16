import os from 'os';
import { Telegraf, Telegram, TelegramError } from 'telegraf';
import type { Message, MessageEntity, Update, User, UserFromGetMe } from 'telegraf/types';
import { AppConfig } from '../../src/shared/infrastructure/config/appConfig';
import { telegramAccess } from '../../src/shared/domain/access/telegramAccess';
import { getTelegramBotStatus, startTelegramBot, TelegramBotHandle } from '../../src/delivery/messaging/telegram/telegramBot';
import { BotModules } from '../../src/delivery/messaging/telegram/types';
import { refuseWebAppOffHttps } from './telegramWebAppRefusal';

/**
 * The bot as it runs (#280): `startTelegramBot` on the real Telegraf 4.16, so Telegraf itself routes every update —
 * the closed access, the session, a command only with its `bot_command` entity and only to this bot's @name, actions,
 * the order `telegramBot.ts` registers the handlers in, `bot.catch`. Only the network is a fake: launch() does not
 * poll, and every Bot API call goes to one private chat that keeps what the bot sent and edited and answers as Telegram
 * does — with a refusal for an edit of a message gone from the chat, an edit that changes nothing, a second answer to
 * a press, a Mini App button off HTTPS (#278), and whatever a test sets with `refuse()` or `block()` (429, 403, a
 * network error). Updates come one at a time or as one batch of getUpdates, handled side by side as Telegraf's polling
 * handles a batch.
 *
 * `install()` in a `beforeEach`, before `start()`; the test's `jest.restoreAllMocks()` takes the fakes away.
 */

export interface StandButton {
  text: string;
  callback_data?: string;
  web_app?: { url: string };
  url?: string;
}

/** A bot message in the chat, as it is now. */
export interface StandMessage {
  id: number;
  text: string;
  keyboard: StandButton[][];
}

export interface ApiCall {
  method: string;
  payload: Record<string, any>;
}

/** What Telegram answers when it refuses a call (the Bot API's error object). */
export interface Refusal {
  error_code: number;
  description: string;
  parameters?: { retry_after?: number };
}

/** Refusals of the Bot API a test may need, word for word. */
export const REFUSAL = {
  editedMessageNotFound: { error_code: 400, description: 'Bad Request: message to edit not found' },
  messageCantBeEdited: { error_code: 400, description: "Bad Request: message can't be edited" },
  notModified: {
    error_code: 400,
    description: 'Bad Request: message is not modified: specified new message content and reply markup are exactly the same',
  },
  chatNotFound: { error_code: 400, description: 'Bad Request: chat not found' },
  tooManyRequests: { error_code: 429, description: 'Too Many Requests: retry after 5', parameters: { retry_after: 5 } },
  blocked: { error_code: 403, description: 'Forbidden: bot was blocked by the user' },
} satisfies Record<string, Refusal>;

const DELETED_MESSAGE_NOT_FOUND: Refusal = { error_code: 400, description: 'Bad Request: message to delete not found' };
const EMPTY_TEXT: Refusal = { error_code: 400, description: 'Bad Request: message text is empty' };
const QUERY_ANSWERED: Refusal = {
  error_code: 400,
  description: 'Bad Request: query is too old and response timeout expired or query ID is invalid',
};

/** The token the stand's bot runs with; Telegraf redacts it in a network error as below. */
const TOKEN = '123:test';

/** A call that never reached Telegram, as Telegraf passes node-fetch's error on: the token redacted. */
export function networkError(method: string): Error {
  return Object.assign(new Error(`request to https://api.telegram.org/bot123:[REDACTED]/${method} failed, reason: ECONNRESET`), {
    name: 'FetchError',
    type: 'system',
    errno: 'ECONNRESET',
    code: 'ECONNRESET',
  });
}

/** The bot getMe answers with: its @name is what a command may be addressed to. */
const STAND_BOT: UserFromGetMe = {
  id: 7_000_000_001,
  is_bot: true,
  first_name: 'Kapelka',
  username: 'KapelkaBot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
};

/** What the bot sends with: every Bot API method the chat changes. */
const CHAT_METHODS = new Set(['sendMessage', 'editMessageText', 'editMessageReplyMarkup', 'deleteMessage', 'sendChatAction', 'sendDocument']);

interface RefusalRule {
  method: string;
  messageId?: number;
  times: number;
  error: Refusal | Error;
}

/** The modules `startTelegramBot` takes; a test passes real ones or fakes of the parts it needs. */
export type StandModules = { [K in keyof BotModules]?: unknown } & { userModule: BotModules['userModule'] };

export interface DeliverOptions {
  /**
   * An update whose handler threw reaches `bot.catch`, which answers «Произошла ошибка»: a delivery fails the test
   * then, as an error out of the handler did before the stand, unless the test is about that path.
   */
  botCatch?: 'fail' | 'allow';
}

export interface PersonMessageOptions extends DeliverOptions {
  /** A Telegram reply to this message of the chat. */
  replyTo?: number;
}

export interface PressOptions extends DeliverOptions {
  /** Who presses: the person by default. */
  from?: number;
}

/** The `bot_command` entities Telegram marks in a text: «/word» or «/word@bot», at the start or after a space. */
function commandEntities(text: string): MessageEntity[] {
  const entities: MessageEntity[] = [];
  for (const match of text.matchAll(/(^|\s)(\/[A-Za-z0-9_]{1,64}(?:@[A-Za-z0-9_]{3,32})?)(?=$|[\s.,!?;:])/g)) {
    entities.push({ type: 'bot_command', offset: (match.index ?? 0) + match[1].length, length: match[2].length });
  }
  return entities;
}

const keyboardOf = (payload: Record<string, any>): StandButton[][] => payload.reply_markup?.inline_keyboard ?? [];
const nowSeconds = () => Math.floor(Date.now() / 1000);

export class TelegramStand {
  /** Every Bot API call the bot made, in order. */
  readonly calls: ApiCall[] = [];
  /** The errors that reached `bot.catch`. */
  readonly caught: unknown[] = [];
  private readonly messages = new Map<number, StandMessage>();
  private readonly answers = new Map<string, Array<string | undefined>>();
  private readonly rules: RefusalRule[] = [];
  private readonly person: User;
  private nextMessageId = 100;
  private nextUpdateId = 1;
  private nextQueryId = 1;
  private blocked = false;
  private launched?: Telegraf<any>;

  constructor(person: { id: number; first_name: string }) {
    this.person = { id: person.id, is_bot: false, first_name: person.first_name, username: `user${person.id}` };
  }

  /** The private chat with the person. */
  get chat(): { id: number; type: 'private'; first_name: string } {
    return { id: this.person.id, type: 'private', first_name: this.person.first_name };
  }

  /** The id of the newest message of the chat, the person's or the bot's. */
  get lastMessageId(): number {
    return this.nextMessageId - 1;
  }

  /**
   * Telegraf without the network: Bot API calls answered by the chat, launch() never polls, `bot.catch` watched. The
   * settings are a polling bot's; `allowed` is ALLOWED_TELEGRAM_IDS (empty: everyone, outside production).
   */
  install({ allowed = [] }: { allowed?: number[] } = {}): void {
    const stand = this;
    jest.replaceProperty(AppConfig, 'TG_BOT_API_KEY', TOKEN);
    jest.replaceProperty(AppConfig, 'ENABLE_TELEGRAM_POLLING', true);
    jest.replaceProperty(AppConfig, 'WEBHOOK_MODE', false);
    // The voice is never downloaded in tests; the bot only makes sure the folder is there
    jest.replaceProperty(AppConfig, 'DOWNLOADS_PATH', os.tmpdir());
    jest.replaceProperty(AppConfig, 'TELEGRAM_ACCESS', telegramAccess(allowed.map(String)));

    jest.spyOn(Telegram.prototype, 'callApi').mockImplementation(function (method: string, payload: unknown) {
      return stand.answer(method, (payload ?? {}) as Record<string, any>);
    } as unknown as Telegram['callApi']);
    jest.spyOn(Telegraf.prototype, 'launch').mockImplementation(function (this: Telegraf<any>) {
      stand.launched = this;
      return new Promise<void>(() => undefined);
    });
    const ownCatch = Telegraf.prototype.catch;
    jest.spyOn(Telegraf.prototype, 'catch').mockImplementation(function (this: Telegraf<any>, handler) {
      return ownCatch.call(this, (error, ctx) => {
        stand.caught.push(error);
        return handler(error, ctx);
      });
    });
  }

  /** Starts the bot with these modules as `startTelegramBot` does in the app; a restart is another `start()`. */
  start(modules: StandModules): TelegramBotHandle {
    this.launched = undefined;
    const m = modules as BotModules;
    const handle = startTelegramBot(
      m.voiceModule, m.transactionModule, m.userModule, m.quickCaptureModule, m.subscriptionModule,
      m.categoryModule, m.accountModule, m.botMessageModule, m.notificationModule, m.authModule
    );
    if (!this.launched) throw new Error(`The bot did not start: ${JSON.stringify(getTelegramBotStatus())}`);
    return handle;
  }

  // ===== What Telegram answers =====

  /** The next `times` calls of `method` (to `messageId`, when given) are refused with `error`. */
  refuse(method: string, error: Refusal | Error, { messageId, times = 1 }: { messageId?: number; times?: number } = {}): void {
    this.rules.push({ method, messageId, times, error });
  }

  /** The person blocked the bot: Telegram refuses whatever the bot sends to the chat with 403 until they write again. */
  block(): void {
    this.blocked = true;
  }

  /**
   * The person deletes a bot message, or clears the history: an edit of it is refused — «message to edit not found»,
   * or the refusal given.
   */
  deleteFromChat(messageId: number, refusal?: Refusal): void {
    this.messages.delete(messageId);
    if (refusal) this.refuse('editMessageText', refusal, { messageId, times: Infinity });
  }

  /** A bot message in the chat from before the test — sent by an earlier version of the bot, say. */
  sentBefore(text: string, keyboard: StandButton[][] = []): number {
    const id = this.nextMessageId++;
    this.messages.set(id, { id, text, keyboard });
    return id;
  }

  private answer(method: string, payload: Record<string, any>): Promise<unknown> {
    this.calls.push({ method, payload });
    try {
      this.applyRules(method, payload);
      return Promise.resolve(this.result(method, payload));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private applyRules(method: string, payload: Record<string, any>): void {
    if (this.blocked && CHAT_METHODS.has(method) && payload.chat_id === this.person.id) refused(REFUSAL.blocked, method, payload);
    const index = this.rules.findIndex(rule => rule.method === method && (rule.messageId === undefined || rule.messageId === payload.message_id));
    if (index === -1) return;
    const rule = this.rules[index];
    rule.times -= 1;
    if (rule.times <= 0) this.rules.splice(index, 1);
    if (rule.error instanceof Error) throw rule.error;
    refused(rule.error, method, payload);
  }

  private result(method: string, payload: Record<string, any>): unknown {
    switch (method) {
      case 'getMe':
        return STAND_BOT;
      case 'getFile':
        return { file_id: payload.file_id, file_unique_id: `u-${payload.file_id}`, file_size: 1000, file_path: `voice/${payload.file_id}.oga` };
      case 'sendMessage':
        return this.send(method, payload);
      case 'editMessageText':
        return this.edit(method, payload, payload.text);
      case 'editMessageReplyMarkup':
        return this.edit(method, payload, undefined);
      case 'deleteMessage':
        if (!this.messages.delete(payload.message_id)) refused(DELETED_MESSAGE_NOT_FOUND, method, payload);
        return true;
      case 'answerCallbackQuery':
        return this.answerPress(method, payload);
      default:
        return true;
    }
  }

  private send(method: string, payload: Record<string, any>): Message.TextMessage {
    if (!String(payload.text ?? '').trim()) refused(EMPTY_TEXT, method, payload);
    refuseWebAppOffHttps(payload);
    const id = this.nextMessageId++;
    this.messages.set(id, { id, text: payload.text, keyboard: keyboardOf(payload) });
    return { message_id: id, date: nowSeconds(), chat: this.chat, from: STAND_BOT, text: payload.text };
  }

  /** An edit: the text given, or the message's own for a keyboard; Telegram refuses one that changes nothing. */
  private edit(method: string, payload: Record<string, any>, text: string | undefined): Message.TextMessage {
    const current = this.messages.get(payload.message_id);
    if (!current) refused(REFUSAL.editedMessageNotFound, method, payload);
    const next: StandMessage = { id: current.id, text: text ?? current.text, keyboard: keyboardOf(payload) };
    if (next.text === current.text && JSON.stringify(next.keyboard) === JSON.stringify(current.keyboard)) refused(REFUSAL.notModified, method, payload);
    refuseWebAppOffHttps(payload);
    this.messages.set(current.id, next);
    return { message_id: current.id, date: nowSeconds(), edit_date: nowSeconds(), chat: this.chat, from: STAND_BOT, text: next.text };
  }

  /** A press is answered once: Telegram refuses a second answer. */
  private answerPress(method: string, payload: Record<string, any>): true {
    const answers = this.answers.get(payload.callback_query_id);
    if (!answers || answers.length > 0) refused(QUERY_ANSWERED, method, payload);
    answers.push(payload.text);
    return true;
  }

  // ===== What the person does =====

  /**
   * Updates as one batch of getUpdates, handled side by side as Telegraf's polling does; resolves once all are done,
   * with the messages the bot sent meanwhile, as they are now.
   */
  async deliver(updates: Update | Update[], { botCatch = 'fail' }: DeliverOptions = {}): Promise<StandMessage[]> {
    const bot = this.launched;
    if (!bot) throw new Error('The bot is not started: call start() first');
    const firstNew = this.nextMessageId;
    const caughtBefore = this.caught.length;
    await Promise.all((Array.isArray(updates) ? updates : [updates]).map(update => bot.handleUpdate(update)));
    const caught = this.caught.slice(caughtBefore);
    if (botCatch === 'fail' && caught.length > 0) {
      throw new Error(`An update reached bot.catch: ${caught.map(error => (error instanceof Error ? error.stack : String(error))).join('\n')}`);
    }
    return [...this.messages.values()].filter(message => message.id >= firstNew);
  }

  /** The person's message as Telegram delivers it; writing to a bot they blocked unblocks it. */
  messageUpdate(content: Record<string, unknown>, { replyTo }: { replyTo?: number } = {}): Update.MessageUpdate {
    this.blocked = false;
    const replied = replyTo === undefined ? undefined : this.messages.get(replyTo);
    const reply = replyTo === undefined ? {} : {
      reply_to_message: { message_id: replyTo, date: nowSeconds(), chat: this.chat, from: STAND_BOT, text: replied?.text ?? '' },
    };
    const message = { message_id: this.nextMessageId++, date: nowSeconds(), chat: this.chat, from: this.person, ...reply, ...content };
    return { update_id: this.nextUpdateId++, message } as Update.MessageUpdate;
  }

  /** A text; a command in it gets its `bot_command` entity, as Telegram marks it. */
  textUpdate(text: string, options: { replyTo?: number } = {}): Update.MessageUpdate {
    const entities = commandEntities(text);
    return this.messageUpdate({ text, ...(entities.length ? { entities } : {}) }, options);
  }

  voiceUpdate(fileId = `voice-${this.nextMessageId}`): Update.MessageUpdate {
    return this.messageUpdate({ voice: { file_id: fileId, file_unique_id: `u-${fileId}`, duration: 2, mime_type: 'audio/ogg' } });
  }

  /** A press of a button with `data` under a message; a message no longer in the chat comes as Telegram sends one. */
  pressUpdate(messageId: number, data: string, { from }: { from?: number } = {}): Update.CallbackQueryUpdate {
    const shown = this.messages.get(messageId);
    const message = shown
      ? { message_id: messageId, date: nowSeconds(), chat: this.chat, from: STAND_BOT, text: shown.text, reply_markup: { inline_keyboard: shown.keyboard } }
      : { message_id: messageId, date: 0, chat: this.chat };
    const presser = from === undefined ? this.person : { id: from, is_bot: false, first_name: 'Stranger' };
    const id = `q${this.nextQueryId++}`;
    this.answers.set(id, []);
    return { update_id: this.nextUpdateId++, callback_query: { id, from: presser, chat_instance: 'stand', data, message } } as Update.CallbackQueryUpdate;
  }

  /** The person writes; resolves once the bot is done with it. */
  async write(text: string, { replyTo, ...options }: PersonMessageOptions = {}): Promise<StandMessage[]> {
    return this.deliver(this.textUpdate(text, { replyTo }), options);
  }

  /** The person sends a voice message. */
  async say(options: DeliverOptions = {}): Promise<StandMessage[]> {
    return this.deliver(this.voiceUpdate(), options);
  }

  /** Presses the button with this data; returns what the bot answered the press with (the popup text, if any). */
  async pressData(messageId: number, data: string, { from, ...options }: PressOptions = {}): Promise<Array<string | undefined>> {
    const update = this.pressUpdate(messageId, data, { from });
    await this.deliver(update, options);
    return this.answers.get(update.callback_query.id) ?? [];
  }

  /** Presses the button with this label under the message. */
  async press(messageId: number, label: string, options: PressOptions = {}): Promise<Array<string | undefined>> {
    return this.pressData(messageId, this.dataOf(messageId, label), options);
  }

  // ===== What the chat shows =====

  has(messageId: number): boolean {
    return this.messages.has(messageId);
  }

  message(messageId: number): StandMessage {
    const found = this.messages.get(messageId);
    if (!found) throw new Error(`No bot message ${messageId} in the chat`);
    return found;
  }

  textOf(messageId: number): string {
    return this.message(messageId).text;
  }

  labelsOf(messageId: number): string[][] {
    return this.message(messageId).keyboard.map(row => row.map(button => button.text));
  }

  /** The callback data of a button as it is now: pressed again later, it is a stale keyboard or a double tap. */
  dataOf(messageId: number, label: string): string {
    const button = this.message(messageId).keyboard.flat().find(candidate => candidate.text === label);
    if (!button?.callback_data) throw new Error(`No button «${label}» under message ${messageId}: ${JSON.stringify(this.labelsOf(messageId))}`);
    return button.callback_data;
  }

  /** The bot messages in the chat, oldest first. */
  botMessages(): StandMessage[] {
    return [...this.messages.values()];
  }
}

function refused(refusal: Refusal, method: string, payload: Record<string, any>): never {
  throw new TelegramError(refusal, { method, payload });
}
