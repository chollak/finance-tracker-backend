import 'reflect-metadata';
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { DataSource } from 'typeorm';
import { createAppDataSource } from '../src/shared/infrastructure/database/database.config';
import { runMigrationsWithBackup } from '../src/shared/infrastructure/database/migrationRunner';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { TransactionModule } from '../src/modules/transaction/transactionModule';
import { SqliteTransactionRepository } from '../src/modules/transaction/infrastructure/persistence/SqliteTransactionRepository';
import { CategoryModule } from '../src/modules/category/categoryModule';
import { SqliteCategoryRepository } from '../src/modules/category/infrastructure/SqliteCategoryRepository';
import { AccountModule } from '../src/modules/account/accountModule';
import { SqliteAccountRepository } from '../src/modules/account/infrastructure/SqliteAccountRepository';
import { SqliteAccountMoveRepository } from '../src/modules/account/infrastructure/SqliteAccountMoveRepository';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { BotMessageModule } from '../src/modules/botMessage/botMessageModule';
import { SqliteBotMessageRepository } from '../src/modules/botMessage/infrastructure/SqliteBotMessageRepository';
import { closeAmountQuestionOnCommand, registerRecordHandlers } from '../src/delivery/messaging/telegram/handlers/recordHandlers';
import { registerCallbackHandlers } from '../src/delivery/messaging/telegram/handlers/callbackHandlers';
import { registerMessageHandlers } from '../src/delivery/messaging/telegram/handlers/messageHandlers';
import { resolveUserIdToUUID } from '../src/shared/application/helpers/userIdResolver';
import { todayDateOnly } from '../src/shared/domain/dates/dateOnly';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { QuickCaptureService } from '../src/modules/quickCapture/application/quickCaptureService';
import { downloadVoiceFile } from '../src/delivery/messaging/telegram/utils';
import { messageClientId } from '../src/delivery/messaging/telegram/utils/messageClientId';
import { isClientId, isStoredClientId, itemClientId } from '../src/modules/transaction/domain/clientId';

// A voice message is not downloaded in tests
jest.mock('../src/delivery/messaging/telegram/utils', () => ({
  downloadVoiceFile: jest.fn(async (_url: string, fileId: string) => `/tmp/voice/${fileId}.ogg`),
  cleanupFile: jest.fn(async () => undefined),
}));

/**
 * FT-167: the process can stop while a message is being handled — the shutdown waits for it only so long — and then
 * Telegram sends the message again after the restart, since its offset was never confirmed. The record it wrote must
 * not be written twice, nor confirmed twice: the person would read two confirmations as two records. Real SQLite file,
 * the real capture pipelines with the parser faked, the handlers registered the way telegramBot.ts registers them.
 */

const TELEGRAM_ID = 131184740;
/** The bot the chat writes to, and another one: a private chat has the person's id with every bot. */
const BOT_ID = 7_000_000_001;
const OTHER_BOT_ID = 8_000_000_002;
const today = todayDateOnly();

interface Button { text: string; callback_data?: string }

type Middleware = (ctx: any, next: () => Promise<void>) => Promise<void> | void;

async function run(chain: Middleware[], ctx: any): Promise<void> {
  const step = async (index: number): Promise<void> => {
    if (index < chain.length) await chain[index](ctx, () => step(index + 1));
  };
  await step(0);
}

/** The middleware, then the first handler that matches — as Telegraf runs a message. */
class Bot {
  readonly middleware: Middleware[] = [];
  readonly handlers: Array<{ filter: (update: any) => boolean; chain: Middleware[] }> = [];
  readonly actions: Array<{ trigger: RegExp | string; handler: (ctx: any) => Promise<void> }> = [];
  use(middleware: Middleware) { this.middleware.push(middleware); }
  on(filter: (update: any) => boolean, ...chain: Middleware[]) { this.handlers.push({ filter, chain }); }
  action(trigger: RegExp | string, handler: (ctx: any) => Promise<void>) { this.actions.push({ trigger, handler }); }
  command() { /* no commands sent here */ }
  async handle(ctx: any): Promise<void> {
    await run([...this.middleware, ...(this.handlers.find(({ filter }) => filter(ctx.update))?.chain ?? [])], ctx);
  }
}

interface Running {
  ds: DataSource;
  bot: Bot;
  modules: Record<string, unknown>;
  userModule: UserModule;
}

describe('a message Telegram sends again after a restart (FT-167)', () => {
  let dir: string;
  let file: string;
  let running: Running;
  const open: DataSource[] = [];
  /** What the bot sent to the chat, in order, and each message as it is now. */
  let sent: string[] = [];
  const shown = new Map<number, { text: string; keyboard: Button[][] }>();
  let nextBotMessageId = 1000;
  /** The bot's next reply never comes back: the process stops while it is being sent. */
  let replyHangs = false;
  const parser = {
    transcribe: jest.fn(),
    analyzeInput: jest.fn(),
    analyzeTransactions: jest.fn(),
  };

  async function start(): Promise<Running> {
    const ds = createAppDataSource(file);
    open.push(ds);
    await ds.initialize();
    await runMigrationsWithBackup(ds, file, path.join(dir, 'backups'));

    const categoryModule = new CategoryModule(new SqliteCategoryRepository(ds));
    const accountModule = new AccountModule(new SqliteAccountRepository(ds), undefined, new SqliteAccountMoveRepository(ds));
    const transactionModule = new TransactionModule(new SqliteTransactionRepository(ds));
    transactionModule.setCategoryResolver(categoryModule.getCatalog());
    transactionModule.setAccountResolver(accountModule.getBook());
    const userModule = new UserModule(new SqliteUserRepository(ds), new SqliteUserSettingsRepository(ds));
    const botMessageModule = new BotMessageModule(new SqliteBotMessageRepository(ds));
    const service = parser as unknown as TranscriptionService;
    const create = transactionModule.getCreateTransactionUseCase();
    const quickCapture = new QuickCaptureService(new ProcessTextInputUseCase(service, create), transactionModule);
    const voice = new ProcessVoiceInputUseCase(service, create);
    const subscriptionModule = {
      getCheckLimitUseCase: () => ({ execute: async () => ({ allowed: true, isPremium: false, currentUsage: 0, limit: 50, remaining: 50 }) }),
      getIncrementUsageUseCase: () => ({ execute: async () => undefined }),
    };

    // In the order telegramBot.ts registers them
    const bot = new Bot();
    bot.use(closeAmountQuestionOnCommand);
    registerRecordHandlers(bot as any);
    registerCallbackHandlers(bot as any);
    registerMessageHandlers(bot as any, subscriptionModule as any, userModule);

    return {
      ds,
      bot,
      userModule,
      modules: {
        transactionModule,
        accountModule,
        categoryModule,
        userModule,
        botMessageModule,
        subscriptionModule,
        quickCaptureModule: { getQuickCaptureService: () => quickCapture },
        voiceModule: { getProcessVoiceInputUseCase: () => voice },
      },
    };
  }

  /** The process stops and starts again: the connection closes; the sessions in memory are gone. */
  async function restart(): Promise<void> {
    await running.ds.destroy();
    running = await start();
  }

  /** What every update carries: the person, the chat, the bot, Telegram's answers to what the bot sends. */
  function baseContext(botId: number) {
    const chat = { id: TELEGRAM_ID, type: 'private' };
    return {
      from: { id: TELEGRAM_ID, first_name: 'Shukur' },
      chat,
      botInfo: { id: botId, is_bot: true, first_name: 'Kapelka', username: 'kapelka_test_bot' },
      modules: running.modules,
      sendChatAction: jest.fn().mockResolvedValue(undefined),
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn((text: string, extra?: any) => {
        if (replyHangs) return new Promise(() => undefined);
        sent.push(text);
        const messageId = nextBotMessageId++;
        shown.set(messageId, { text, keyboard: extra?.reply_markup?.inline_keyboard ?? [] });
        return Promise.resolve({ message_id: messageId, chat });
      }),
      telegram: {
        editMessageText: jest.fn(async (_chat: string, messageId: number, _inline: unknown, text: string, extra?: any) => {
          shown.set(messageId, { text, keyboard: extra?.reply_markup?.inline_keyboard ?? [] });
          return true;
        }),
        getFileLink: jest.fn(async () => ({ href: 'https://telegram.test/voice.ogg' })),
      },
    };
  }

  /** One update from Telegram, handled to the end — unless a reply hangs, as when the process is stopped. */
  function deliver(message: Record<string, unknown>, session: Record<string, unknown> = {}, botId = BOT_ID): Promise<void> {
    const base = baseContext(botId);
    const full = { message_id: 10, date: 1_761_700_000, chat: base.chat, from: base.from, ...message };
    return running.bot.handle({ ...base, message: full, update: { update_id: 500 + Number(full.message_id), message: full }, session });
  }

  /** The person presses a button under a bot message. */
  async function press(messageId: number, label: string): Promise<void> {
    const button = shown.get(messageId)?.keyboard.flat().find(candidate => candidate.text === label);
    if (!button?.callback_data) throw new Error(`No button «${label}» under message ${messageId}`);
    const data = button.callback_data;
    const action = running.bot.actions.find(({ trigger }) => (typeof trigger === 'string' ? trigger === data : trigger.test(data)));
    if (!action) throw new Error(`No handler for ${data}`);
    const ctx: any = { ...baseContext(BOT_ID), callbackQuery: { data, message: { message_id: messageId, chat: { id: TELEGRAM_ID } } } };
    ctx.match = typeof action.trigger === 'string' ? [data] : action.trigger.exec(data);
    await action.handler(ctx);
  }

  /** The id of the bot message sent last. */
  const lastBotMessage = () => nextBotMessageId - 1;

  async function records(): Promise<Array<{ amountMinor: number; description: string; deletedAt: string | null }>> {
    const rows = await running.ds.query('SELECT amount_minor AS amountMinor, description, deleted_at AS deletedAt FROM transactions ORDER BY createdAt, rowid');
    return rows.map((row: any) => ({ ...row, amountMinor: Number(row.amountMinor) }));
  }

  const confirmations = () => sent.filter(text => /Расход/.test(text));
  const coffee = { intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense', date: today, description: 'кофе' };

  beforeEach(async () => {
    sent = [];
    shown.clear();
    replyHangs = false;
    parser.transcribe.mockReset();
    parser.analyzeInput.mockReset().mockResolvedValue({ transactions: [coffee], debts: [] });
    parser.analyzeTransactions.mockReset();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft167-redelivery-'));
    file = path.join(dir, 'db.sqlite');
    jest.spyOn(AppConfig, 'getWebAppUrl').mockReturnValue('https://miniapp.test');
    running = await start();
    await resolveUserIdToUUID(String(TELEGRAM_ID), running.userModule);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    (downloadVoiceFile as jest.Mock).mockClear();
    for (const ds of open.splice(0)) if (ds.isInitialized) await ds.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('a text phrase is written and confirmed once', async () => {
    await deliver({ message_id: 10, text: 'кофе 25 тысяч' });
    expect(await records()).toHaveLength(1);
    expect(confirmations()).toHaveLength(1);
    const before = sent.length;

    await restart();
    await deliver({ message_id: 10, text: 'кофе 25 тысяч' });

    expect(await records()).toEqual([expect.objectContaining({ amountMinor: 2_500_000 })]);
    expect(sent).toHaveLength(before);
    expect(parser.analyzeInput.mock.calls.length).toBeLessThanOrEqual(1);
    // The same words in a new message are a new record
    await deliver({ message_id: 11, text: 'кофе 25 тысяч' });
    expect(await records()).toHaveLength(2);
  });

  it('stopped before the confirmation went out: the repeat confirms the record it wrote, and writes nothing', async () => {
    replyHangs = true;
    void deliver({ message_id: 10, text: 'кофе 25 тысяч' });
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(await records()).toHaveLength(1);
    expect(confirmations()).toHaveLength(0);
    const parsed = parser.analyzeInput.mock.calls.length;

    replyHangs = false;
    await restart();
    await deliver({ message_id: 10, text: 'кофе 25 тысяч' });

    expect(await records()).toHaveLength(1);
    expect(confirmations()).toEqual([expect.stringContaining('Кофе')]);
    expect(parser.analyzeInput).toHaveBeenCalledTimes(parsed);
  });

  it('a voice message is neither downloaded nor transcribed again, and written once', async () => {
    jest.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
    jest.spyOn(fsPromises, 'rename').mockResolvedValue(undefined);
    jest.spyOn(fsPromises, 'unlink').mockResolvedValue(undefined);
    parser.transcribe.mockResolvedValue('кофе 25 тысяч');
    const voice = { message_id: 12, voice: { file_id: 'voice-12', duration: 2 } };

    await deliver(voice);
    expect(await records()).toHaveLength(1);
    expect(confirmations()).toHaveLength(1);
    const before = sent.length;

    await restart();
    await deliver(voice);

    expect(await records()).toHaveLength(1);
    expect(sent).toHaveLength(before);
    expect(parser.transcribe).toHaveBeenCalledTimes(1);
    expect(downloadVoiceFile).toHaveBeenCalledTimes(1);
  });

  it('the amount after a quick-add category is written once, though the session that asked for it is gone', async () => {
    await deliver({ message_id: 14, text: '500' }, { pendingAction: { type: 'awaiting_amount', category: 'Кафе' } });
    expect(await records()).toEqual([expect.objectContaining({ amountMinor: 50_000 })]);
    const before = sent.length;

    await restart();
    await deliver({ message_id: 14, text: '500' });

    expect(await records()).toHaveLength(1);
    expect(sent).toHaveLength(before);
  });

  it('the answer to «Сколько?» is written once', async () => {
    const taxi = { description: 'такси', category: 'Транспорт', type: 'expense', date: today };
    // Read on its own, «18 тысяч» is a record of 18 000 — what the repeat would write once the question is closed
    parser.analyzeInput.mockImplementation(async (text: string) => (text === 'такси'
      ? { transactions: [], debts: [], withoutAmount: [taxi] }
      : { transactions: [{ intent: 'transaction', amount: 18000, category: 'Другое', type: 'expense', date: today, description: text }], debts: [] }));
    await deliver({ message_id: 16, text: 'такси' });
    await deliver({ message_id: 17, text: '18 тысяч' });
    expect(await records()).toEqual([expect.objectContaining({ amountMinor: 1_800_000, description: 'такси' })]);
    const before = sent.length;

    await restart();
    await deliver({ message_id: 17, text: '18 тысяч' });

    expect(await records()).toHaveLength(1);
    expect(sent).toHaveLength(before);
  });

  it('a record the person cancelled stays cancelled', async () => {
    await deliver({ message_id: 10, text: 'кофе 25 тысяч' });
    await running.ds.query('UPDATE transactions SET deleted_at = ?', [new Date().toISOString()]);

    await restart();
    await deliver({ message_id: 10, text: 'кофе 25 тысяч' });

    expect(await records()).toEqual([expect.objectContaining({ deletedAt: expect.any(String) })]);
  });

  it('the same message number from another bot is a new message, though the chat and bot_messages are the same', async () => {
    const taxi = { intent: 'transaction', amount: 30000, category: 'Транспорт', type: 'expense', date: today, description: 'такси' };
    parser.analyzeInput.mockImplementation(async (text: string) => ({ transactions: [text.startsWith('такси') ? taxi : coffee], debts: [] }));
    await deliver({ message_id: 10, text: 'кофе 25 тысяч' }, {}, BOT_ID);
    // The move to another bot (live-instance.md, «Переезд»): bot_messages is cleared, the records stay
    await running.ds.query('DELETE FROM bot_messages');

    await restart();
    await deliver({ message_id: 10, text: 'такси 30 тысяч' }, {}, OTHER_BOT_ID);

    expect(await records()).toEqual([
      expect.objectContaining({ amountMinor: 2_500_000, description: 'кофе' }),
      expect.objectContaining({ amountMinor: 3_000_000, description: 'такси' }),
    ]);
    expect(confirmations()[confirmations().length - 1]).toContain('Такси');
  });

  it('the answer to «Сумму» changes the amount once and writes nothing', async () => {
    // Read on its own, «30000» is a record of 30 000 — what the repeat would write once the question is closed
    parser.analyzeInput.mockImplementation(async (text: string) => ({
      transactions: [text.startsWith('кофе') ? coffee : { intent: 'transaction', amount: 30000, category: 'Другое', type: 'expense', date: today, description: text }],
      debts: [],
    }));
    await deliver({ message_id: 10, text: 'кофе 25 тысяч' });
    const confirmation = lastBotMessage();
    await press(confirmation, 'Изменить');
    await press(confirmation, 'Сумму');
    await deliver({ message_id: 11, text: '30000' });
    expect(await records()).toEqual([expect.objectContaining({ amountMinor: 3_000_000, description: 'кофе' })]);
    const before = sent.length;

    await restart();
    await deliver({ message_id: 11, text: '30000' });

    expect(await records()).toEqual([expect.objectContaining({ amountMinor: 3_000_000, description: 'кофе' })]);
    expect(sent).toHaveLength(before);
  });

  it('the typed answer to a large amount writes the record once', async () => {
    parser.analyzeInput.mockImplementation(async (text: string) => ({
      transactions: [text.startsWith('кофе')
        ? { ...coffee, amount: 25_000_000 }
        : { intent: 'transaction', amount: 25000, category: 'Другое', type: 'expense', date: today, description: text }],
      debts: [],
    }));
    await deliver({ message_id: 10, text: 'кофе 25000000' });
    expect(shown.get(lastBotMessage())?.text).toContain('Сумма большая');
    await deliver({ message_id: 11, text: '25000' });
    expect(await records()).toEqual([expect.objectContaining({ amountMinor: 2_500_000, description: 'кофе', deletedAt: null })]);
    const before = sent.length;

    await restart();
    await deliver({ message_id: 11, text: '25000' });

    expect(await records()).toEqual([expect.objectContaining({ amountMinor: 2_500_000, description: 'кофе', deletedAt: null })]);
    expect(sent).toHaveLength(before);
  });
});

describe('the client id of a Telegram message (FT-167)', () => {
  const ctxOf = (botId: number | undefined, chatId: number, messageId: number) =>
    ({ botInfo: botId === undefined ? undefined : { id: botId }, chat: { id: chatId }, message: { message_id: messageId } }) as any;

  it('names the bot, the chat and the message', () => {
    expect(messageClientId(ctxOf(BOT_ID, TELEGRAM_ID, 10))).toBe(`tg-${BOT_ID}-${TELEGRAM_ID}-10`);
    expect(messageClientId(ctxOf(OTHER_BOT_ID, TELEGRAM_ID, 10))).not.toBe(messageClientId(ctxOf(BOT_ID, TELEGRAM_ID, 10)));
  });

  it('fits the client id rules at the largest Telegram ids, with the «:n» of a phrase’s further records', () => {
    // Bot and chat ids up to 52 bits, a group's chat id negative, message ids up to 2^31
    const id = messageClientId(ctxOf(Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 2_147_483_647))!;
    expect(isClientId(id)).toBe(true);
    expect(isStoredClientId(itemClientId(id, 999))).toBe(true);
  });

  it('is none without the bot, the chat or the message: nothing is guarded then', () => {
    expect(messageClientId(ctxOf(undefined, TELEGRAM_ID, 10))).toBeUndefined();
    expect(messageClientId({ botInfo: { id: BOT_ID }, chat: { id: TELEGRAM_ID } } as any)).toBeUndefined();
  });
});
