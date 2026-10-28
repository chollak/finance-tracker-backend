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
const today = todayDateOnly();

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
  use(middleware: Middleware) { this.middleware.push(middleware); }
  on(filter: (update: any) => boolean, ...chain: Middleware[]) { this.handlers.push({ filter, chain }); }
  action() { /* no buttons pressed here */ }
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
  /** What the bot sent to the chat, in order. */
  let sent: string[] = [];
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

  /** One update from Telegram, handled to the end — unless a reply hangs, as when the process is stopped. */
  function deliver(message: Record<string, unknown>, session: Record<string, unknown> = {}): Promise<void> {
    const full = { message_id: 10, date: 1_761_700_000, chat: { id: TELEGRAM_ID, type: 'private' }, from: { id: TELEGRAM_ID, first_name: 'Shukur' }, ...message };
    const ctx = {
      from: full.from,
      chat: full.chat,
      message: full,
      update: { update_id: 500 + Number(full.message_id), message: full },
      session,
      modules: running.modules,
      sendChatAction: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn((text: string) => {
        if (replyHangs) return new Promise(() => undefined);
        sent.push(text);
        return Promise.resolve({ message_id: nextBotMessageId++, chat: full.chat });
      }),
      telegram: {
        editMessageText: jest.fn().mockResolvedValue(true),
        getFileLink: jest.fn(async () => ({ href: 'https://telegram.test/voice.ogg' })),
      },
    };
    return running.bot.handle(ctx);
  }

  async function records(): Promise<Array<{ amountMinor: number; description: string; deletedAt: string | null }>> {
    const rows = await running.ds.query('SELECT amount_minor AS amountMinor, description, deleted_at AS deletedAt FROM transactions ORDER BY createdAt');
    return rows.map((row: any) => ({ ...row, amountMinor: Number(row.amountMinor) }));
  }

  const confirmations = () => sent.filter(text => /Расход/.test(text));
  const coffee = { intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense', date: today, description: 'кофе' };

  beforeEach(async () => {
    sent = [];
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
});
