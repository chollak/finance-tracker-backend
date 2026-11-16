import os from 'os';
import { Telegraf, Telegram, TelegramError } from 'telegraf';
import type { Message, MessageEntity, Update, User, UserFromGetMe } from 'telegraf/types';
import { AppConfig } from '../../src/shared/infrastructure/config/appConfig';
import { telegramAccess, telegramIdOf } from '../../src/shared/domain/access/telegramAccess';
import { getTelegramBotStatus, startTelegramBot, TelegramBotHandle } from '../../src/delivery/messaging/telegram/telegramBot';
import { BotModules } from '../../src/delivery/messaging/telegram/types';
import { refuseWebAppOffHttps } from './telegramWebAppRefusal';

/**
 * The bot as it runs (#280): `startTelegramBot` on the real Telegraf 4.16, so Telegraf itself routes every update —
 * the closed access, the session, a command only with its `bot_command` entity and only to this bot's @name, actions,
 * the order `telegramBot.ts` registers the handlers in, `bot.catch`. Only the network is a fake: launch() does not
 * poll, and every Bot API call goes to Telegram's private chats with the bot, which keep what the bot sent and edited
 * and answer as Telegram does — with a refusal for a chat Telegram does not have with the bot, an edit of a message gone
 * from its chat, an edit that changes nothing, a second answer to a press, a Mini App button off HTTPS (#278), and
 * whatever a test sets with `refuse()`, `block()` or `hang()` (429, 403, a network error, a process killed while it
 * waits). Updates come one at a time or as one batch of getUpdates, handled side by side as Telegraf's polling handles a
 * batch.
 *
 * The chats (#294): the person's, of everyone whose update came, and of anyone a test names with `chatWith()`. A chat
 * is its person's Telegram id, so a `chat_id` sent as a number or as a string is the same chat — the notices send it as
 * a string. A call to any other chat is refused with «chat not found».
 *
 * `install()` in a `beforeEach`, before `start()`; the test's `jest.restoreAllMocks()` takes the fakes away.
 */

export interface StandButton {
  text: string;
  callback_data?: string;
  web_app?: { url: string };
  url?: string;
}

/** A bot message in a chat, as it is now. */
export interface StandMessage {
  id: number;
  text: string;
  keyboard: StandButton[][];
}

/** A message the bot sent, as it sent it: the chat named as the bot named it, the text and the buttons it had then. */
export interface SentMessage {
  chatId: string;
  messageId: number;
  text: string;
  keyboard: StandButton[][];
}

export interface ApiCall {
  method: string;
  payload: Record<string, any>;
  /** What Telegram answered instead of a result: a refusal, or the error of a call that never got through. */
  refusedWith?: unknown;
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

/** What the bot sends with: every Bot API method that goes to a chat. */
const CHAT_METHODS = new Set(['sendMessage', 'editMessageText', 'editMessageReplyMarkup', 'deleteMessage', 'sendChatAction', 'sendDocument']);

interface RefusalRule {
  method: string;
  messageId?: number;
  times: number;
  error: Refusal | Error;
}

/** The modules `startTelegramBot` takes; a test passes real ones or fakes of the parts it needs. */
export type StandModules = { [K in keyof BotModules]?: unknown } & { userModule: BotModules['userModule'] };

export interface InstallOptions {
  /** ALLOWED_TELEGRAM_IDS (empty: everyone, outside production). */
  allowed?: number[];
  /** Where Telegram's file storage is: a voice's `getFileLink` points there (a server on 127.0.0.1 in a test). */
  fileRoot?: string;
}

export interface StartOptions {
  /** The bot's own id, as getMe answers it: another bot over the same database (live-instance.md, «Переезд»). */
  botId?: number;
}

export interface DeliverOptions {
  /**
   * An update whose handler threw reaches `bot.catch`, which answers «Произошла ошибка»: a delivery fails the test
   * then, as an error out of the handler did before the stand, unless the test is about that path.
   */
  botCatch?: 'fail' | 'allow';
}

/** Someone other than the person: their Telegram id, or the id and the name. */
export type Someone = number | { id: number; first_name?: string };

export interface UpdateOptions {
  /** Who writes, in their own private chat with the bot: the person by default. */
  from?: Someone;
  /** When the message was sent (`message.date`); now by default, `null` — a message without a date. */
  sentAt?: Date | null;
}

export interface TextOptions extends UpdateOptions {
  /** A Telegram reply to this message of the chat. */
  replyTo?: number;
}

export type PersonMessageOptions = TextOptions & DeliverOptions;

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
const unixSeconds = (moment: Date) => Math.floor(moment.getTime() / 1000);
const nowSeconds = () => unixSeconds(new Date());

/** A private chat is its person's Telegram id: `597843119` and `'597843119'` are one chat. Null for anything else. */
function chatKey(chatId: unknown): string | null {
  return chatId === undefined || chatId === null ? null : telegramIdOf(String(chatId));
}

export class TelegramStand {
  /** Every Bot API call the bot made, in order. */
  readonly calls: ApiCall[] = [];
  /** The errors that reached `bot.catch`. */
  readonly caught: unknown[] = [];
  private readonly messages = new Map<number, StandMessage>();
  /** The chat each bot message is in. */
  private readonly chatOfMessage = new Map<number, string>();
  /** The private chats Telegram has with the bot, each with its person. */
  private readonly people = new Map<string, User>();
  private readonly blocked = new Set<string>();
  /** The methods whose calls never return, and what learns of the first such call. */
  private readonly hangs = new Map<string, () => void>();
  /** What Telegram answered each call it took. */
  private readonly results = new Map<ApiCall, unknown>();
  private readonly answers = new Map<string, Array<string | undefined>>();
  private readonly rules: RefusalRule[] = [];
  private readonly person: User;
  private botInfo: UserFromGetMe = STAND_BOT;
  private fileRoot?: string;
  private nextMessageId = 100;
  private nextUpdateId = 1;
  private nextQueryId = 1;
  private launched?: Telegraf<any>;

  constructor(person: { id: number; first_name: string }) {
    this.person = { id: person.id, is_bot: false, first_name: person.first_name, username: `user${person.id}` };
    this.people.set(String(person.id), this.person);
  }

  /** The private chat with the person. */
  get chat(): { id: number; type: 'private'; first_name: string } {
    return privateChat(this.person);
  }

  /** The id of the newest message of the stand, the person's or the bot's, in any chat. */
  get lastMessageId(): number {
    return this.nextMessageId - 1;
  }

  /** The Bot API client of the started bot: what the app gives the notices' senders (`summarySender(bot.telegram)`). */
  get telegram(): Telegram {
    if (!this.launched) throw new Error('The bot is not started: call start() first');
    return this.launched.telegram;
  }

  /**
   * Telegraf without the network: Bot API calls answered by the chats, launch() never polls, `bot.catch` watched. The
   * settings are a polling bot's.
   */
  install({ allowed = [], fileRoot }: InstallOptions = {}): void {
    const stand = this;
    this.fileRoot = fileRoot;
    jest.replaceProperty(AppConfig, 'TG_BOT_API_KEY', TOKEN);
    jest.replaceProperty(AppConfig, 'ENABLE_TELEGRAM_POLLING', true);
    // The voice is never downloaded into the project; the bot only makes sure the folder is there
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

  /**
   * Starts the bot with these modules as `startTelegramBot` does in the app; a restart is another `start()` — a new
   * process: whatever hung in the one before stays hung there, and Telegram answers the new one.
   */
  start(modules: StandModules, { botId }: StartOptions = {}): TelegramBotHandle {
    this.launched = undefined;
    this.hangs.clear();
    this.botInfo = botId === undefined ? STAND_BOT : { ...STAND_BOT, id: botId, username: `Kapelka${botId}Bot` };
    const m = modules as BotModules;
    const handle = startTelegramBot(
      m.voiceModule, m.transactionModule, m.userModule, m.quickCaptureModule, m.subscriptionModule,
      m.categoryModule, m.accountModule, m.botMessageModule, m.notificationModule, m.authModule
    );
    const launched = this.launched as Telegraf<any> | undefined;
    if (!launched) throw new Error(`The bot did not start: ${JSON.stringify(getTelegramBotStatus())}`);
    // What the launch learns from getMe before it polls: the bot knows its own name before the first update
    launched.botInfo = this.botInfo;
    // Telegram's file storage: every update's client shares these options
    if (this.fileRoot) Object.assign(launched.telegram.options, { apiRoot: this.fileRoot });
    return handle;
  }

  // ===== What Telegram answers =====

  /** The next `times` calls of `method` (to `messageId`, when given) are refused with `error`. */
  refuse(method: string, error: Refusal | Error, { messageId, times = 1 }: { messageId?: number; times?: number } = {}): void {
    this.rules.push({ method, messageId, times, error });
  }

  /** Telegram answers `method` again — every method, when none is named: what `refuse()` set is gone. */
  stopRefusing(method?: string): void {
    for (let index = this.rules.length - 1; index >= 0; index -= 1) {
      if (method === undefined || this.rules[index].method === method) this.rules.splice(index, 1);
    }
  }

  /**
   * The person — or whoever has the chat `chatId` — blocked the bot: Telegram refuses whatever the bot sends to that
   * chat with 403 until they write again.
   */
  block(chatId: number | string = this.person.id): void {
    const chat = chatKey(chatId);
    if (chat === null) throw new Error(`Not a private chat: ${chatId}`);
    this.blocked.add(chat);
  }

  /** They unblock the bot in Telegram's settings, without writing to it: Telegram takes its messages again. */
  unblock(chatId: number | string = this.person.id): void {
    this.blocked.delete(String(chatKey(chatId)));
  }

  /**
   * The process is killed while it waits for Telegram: from now on no call of `method` returns, and none reaches a chat,
   * until the next `start()`. Resolves once the first such call is made.
   */
  hang(method: string): Promise<void> {
    return new Promise(resolve => this.hangs.set(method, resolve));
  }

  /** Someone else who started the bot: Telegram has a private chat with them, and the bot may write to it. */
  chatWith(someone: Someone): void {
    const user = this.userOf(someone);
    this.people.set(String(user.id), user);
  }

  /**
   * The person deletes a bot message, or clears the history: an edit of it is refused — «message to edit not found»,
   * or the refusal given.
   */
  deleteFromChat(messageId: number, refusal?: Refusal): void {
    this.messages.delete(messageId);
    this.chatOfMessage.delete(messageId);
    if (refusal) this.refuse('editMessageText', refusal, { messageId, times: Infinity });
  }

  /** A bot message in the person's chat from before the test — sent by an earlier version of the bot, say. */
  sentBefore(text: string, keyboard: StandButton[][] = []): number {
    const id = this.nextMessageId++;
    this.messages.set(id, { id, text, keyboard });
    this.chatOfMessage.set(id, String(this.person.id));
    return id;
  }

  private answer(method: string, payload: Record<string, any>): Promise<unknown> {
    const call: ApiCall = { method, payload };
    this.calls.push(call);
    const hung = this.hangs.get(method);
    if (hung) {
      hung();
      return new Promise<never>(() => undefined);
    }
    try {
      this.applyRules(method, payload);
      const result = this.result(method, payload);
      this.results.set(call, result);
      return Promise.resolve(result);
    } catch (error) {
      call.refusedWith = error;
      return Promise.reject(error);
    }
  }

  private applyRules(method: string, payload: Record<string, any>): void {
    if (CHAT_METHODS.has(method)) {
      const chat = chatKey(payload.chat_id);
      if (chat === null || !this.people.has(chat)) refused(REFUSAL.chatNotFound, method, payload);
      if (this.blocked.has(chat)) refused(REFUSAL.blocked, method, payload);
    }
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
        return this.botInfo;
      case 'getFile':
        return { file_id: payload.file_id, file_unique_id: `u-${payload.file_id}`, file_size: 1000, file_path: `voice/${payload.file_id}.oga` };
      case 'sendMessage':
        return this.send(method, payload);
      case 'editMessageText':
        return this.edit(method, payload, payload.text);
      case 'editMessageReplyMarkup':
        return this.edit(method, payload, undefined);
      case 'deleteMessage':
        if (!this.inChat(payload)) refused(DELETED_MESSAGE_NOT_FOUND, method, payload);
        this.messages.delete(payload.message_id);
        this.chatOfMessage.delete(payload.message_id);
        return true;
      case 'answerCallbackQuery':
        return this.answerPress(method, payload);
      default:
        return true;
    }
  }

  /** The message `payload` names, if it is in the chat `payload` names. */
  private inChat(payload: Record<string, any>): StandMessage | undefined {
    const chat = chatKey(payload.chat_id);
    return chat !== null && this.chatOfMessage.get(payload.message_id) === chat ? this.messages.get(payload.message_id) : undefined;
  }

  private chatOf(chat: string): ReturnType<typeof privateChat> {
    return privateChat(this.people.get(chat)!);
  }

  private send(method: string, payload: Record<string, any>): Message.TextMessage {
    if (!String(payload.text ?? '').trim()) refused(EMPTY_TEXT, method, payload);
    refuseWebAppOffHttps(payload);
    const chat = chatKey(payload.chat_id)!;
    const id = this.nextMessageId++;
    this.messages.set(id, { id, text: payload.text, keyboard: keyboardOf(payload) });
    this.chatOfMessage.set(id, chat);
    return { message_id: id, date: nowSeconds(), chat: this.chatOf(chat), from: this.botInfo, text: payload.text };
  }

  /**
   * An edit: the text given, or the message's own for a keyboard; Telegram refuses one of a message not in that chat,
   * and one that changes nothing.
   */
  private edit(method: string, payload: Record<string, any>, text: string | undefined): Message.TextMessage {
    const current = this.inChat(payload);
    if (!current) refused(REFUSAL.editedMessageNotFound, method, payload);
    // The buttons are checked before the edit is compared with the message
    refuseWebAppOffHttps(payload);
    const next: StandMessage = { id: current.id, text: text ?? current.text, keyboard: keyboardOf(payload) };
    if (next.text === current.text && JSON.stringify(next.keyboard) === JSON.stringify(current.keyboard)) refused(REFUSAL.notModified, method, payload);
    this.messages.set(current.id, next);
    const chat = this.chatOf(this.chatOfMessage.get(current.id)!);
    return { message_id: current.id, date: nowSeconds(), edit_date: nowSeconds(), chat, from: this.botInfo, text: next.text };
  }

  /**
   * A press is answered once: Telegram refuses a second answer. The refused one is kept too, so a test sees every
   * answer the bot tried — a handler that swallows the refusal would hide a second «Произошла ошибка» otherwise.
   */
  private answerPress(method: string, payload: Record<string, any>): true {
    const answers = this.answers.get(payload.callback_query_id);
    if (!answers) refused(QUERY_ANSWERED, method, payload);
    answers.push(payload.text);
    if (answers.length > 1) refused(QUERY_ANSWERED, method, payload);
    return true;
  }

  // ===== What the people do =====

  /**
   * Updates as one batch of getUpdates, handled side by side as Telegraf's polling does; resolves once all are done,
   * with the messages the bot sent meanwhile, in any chat, as they are now. A private chat an update comes from is one
   * Telegram has with the bot from then on; writing to a bot one blocked unblocks it.
   */
  async deliver(updates: Update | Update[], { botCatch = 'fail' }: DeliverOptions = {}): Promise<StandMessage[]> {
    const bot = this.launched;
    if (!bot) throw new Error('The bot is not started: call start() first');
    const batch = Array.isArray(updates) ? updates : [updates];
    for (const update of batch) this.arrived(update);
    const firstNew = this.nextMessageId;
    const caughtBefore = this.caught.length;
    await Promise.all(batch.map(update => bot.handleUpdate(update)));
    const caught = this.caught.slice(caughtBefore);
    if (botCatch === 'fail' && caught.length > 0) {
      throw new Error(`An update reached bot.catch: ${caught.map(error => (error instanceof Error ? error.stack : String(error))).join('\n')}`);
    }
    return [...this.messages.values()].filter(message => message.id >= firstNew);
  }

  /** The chat of an update Telegram delivers: it has the chat with the bot; a message from it unblocks the bot. */
  private arrived(update: Update): void {
    const message = 'message' in update ? update.message : undefined;
    const chat = message?.chat ?? ('callback_query' in update ? update.callback_query.message?.chat : undefined)
      ?? ('edited_message' in update ? update.edited_message.chat : undefined);
    if (chat?.type !== 'private') return;
    const key = String(chat.id);
    if (!this.people.has(key)) this.people.set(key, { id: chat.id, is_bot: false, first_name: chat.first_name ?? `Person ${chat.id}` });
    if (message) this.blocked.delete(key);
  }

  private userOf(someone: Someone | undefined): User {
    if (someone === undefined) return this.person;
    const { id, first_name: name } = typeof someone === 'number' ? { id: someone, first_name: undefined } : someone;
    const known = this.people.get(String(id));
    return { id, is_bot: false, first_name: name ?? known?.first_name ?? `Person ${id}`, username: `user${id}` };
  }

  /** A message as Telegram delivers it, in the private chat of whoever writes. */
  messageUpdate(content: Record<string, unknown>, { replyTo, from, sentAt }: TextOptions = {}): Update.MessageUpdate {
    const sender = this.userOf(from);
    const chat = privateChat(sender);
    const replied = replyTo === undefined ? undefined : this.messages.get(replyTo);
    const reply = replyTo === undefined ? {} : {
      reply_to_message: { message_id: replyTo, date: nowSeconds(), chat, from: this.botInfo, text: replied?.text ?? '' },
    };
    const date = sentAt === null ? {} : { date: sentAt === undefined ? nowSeconds() : unixSeconds(sentAt) };
    const message = { message_id: this.nextMessageId++, ...date, chat, from: sender, ...reply, ...content };
    return { update_id: this.nextUpdateId++, message } as Update.MessageUpdate;
  }

  /** A text; a command in it gets its `bot_command` entity, as Telegram marks it. */
  textUpdate(text: string, options: TextOptions = {}): Update.MessageUpdate {
    const entities = commandEntities(text);
    return this.messageUpdate({ text, ...(entities.length ? { entities } : {}) }, options);
  }

  voiceUpdate(fileId = `voice-${this.nextMessageId}`, options: UpdateOptions = {}): Update.MessageUpdate {
    return this.messageUpdate({ voice: { file_id: fileId, file_unique_id: `u-${fileId}`, duration: 2, mime_type: 'audio/ogg' } }, options);
  }

  /**
   * A press of a button with `data` under a message; a message no longer in the chat comes as Telegram sends one, in
   * the chat of whoever presses.
   */
  pressUpdate(messageId: number, data: string, { from }: { from?: number } = {}): Update.CallbackQueryUpdate {
    const presser = this.userOf(from);
    const shown = this.messages.get(messageId);
    const message = shown
      ? {
        message_id: messageId,
        date: nowSeconds(),
        chat: this.chatOf(this.chatOfMessage.get(messageId)!),
        from: this.botInfo,
        text: shown.text,
        reply_markup: { inline_keyboard: shown.keyboard },
      }
      : { message_id: messageId, date: 0, chat: privateChat(presser) };
    const id = `q${this.nextQueryId++}`;
    this.answers.set(id, []);
    return { update_id: this.nextUpdateId++, callback_query: { id, from: presser, chat_instance: 'stand', data, message } } as Update.CallbackQueryUpdate;
  }

  /** The person — or someone else, `from` — writes; resolves once the bot is done with it. */
  async write(text: string, { replyTo, from, sentAt, ...options }: PersonMessageOptions = {}): Promise<StandMessage[]> {
    return this.deliver(this.textUpdate(text, { replyTo, from, sentAt }), options);
  }

  /** The person — or someone else, `from` — sends a voice message. */
  async say({ from, sentAt, ...options }: UpdateOptions & DeliverOptions = {}): Promise<StandMessage[]> {
    return this.deliver(this.voiceUpdate(undefined, { from, sentAt }), options);
  }

  /**
   * Presses the button with this data; returns every answer the bot gave the press (the popup text, if any), the
   * refused second one included: one answer is `[text]`.
   */
  async pressData(messageId: number, data: string, { from, ...options }: PressOptions = {}): Promise<Array<string | undefined>> {
    const update = this.pressUpdate(messageId, data, { from });
    await this.deliver(update, options);
    return this.answers.get(update.callback_query.id) ?? [];
  }

  /** Presses the button with this label under the message. */
  async press(messageId: number, label: string, options: PressOptions = {}): Promise<Array<string | undefined>> {
    return this.pressData(messageId, this.dataOf(messageId, label), options);
  }

  // ===== What the chats show =====

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

  /** The bot messages in a chat — the person's by default — oldest first. */
  botMessages(chatId: number | string = this.person.id): StandMessage[] {
    const chat = chatKey(chatId);
    return [...this.messages.values()].filter(message => this.chatOfMessage.get(message.id) === chat);
  }

  /** Every message Telegram took from the bot, in any chat, oldest first — as the bot sent it, before any edit. */
  sent(): SentMessage[] {
    return this.calls
      .filter(call => call.method === 'sendMessage' && this.results.has(call))
      .map(call => ({ payload: call.payload, message: this.results.get(call) as Message.TextMessage }))
      .map(({ payload, message }) => ({
        chatId: String(payload.chat_id),
        messageId: message.message_id,
        text: payload.text,
        keyboard: keyboardOf(payload),
      }));
  }
}

function privateChat(person: User): { id: number; type: 'private'; first_name: string } {
  return { id: person.id, type: 'private', first_name: person.first_name };
}

function refused(refusal: Refusal, method: string, payload: Record<string, any>): never {
  throw new TelegramError(refusal, { method, payload });
}
