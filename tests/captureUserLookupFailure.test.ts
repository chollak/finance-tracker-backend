import 'reflect-metadata';
import express from 'express';
import http from 'http';
import fsPromises from 'fs/promises';
import { DataSource } from 'typeorm';
import { telegramAccess } from '../src/shared/domain/access/telegramAccess';
import { MIN_PRODUCTION_SHORTCUT_TOKEN_LENGTH } from '../src/shared/domain/access/shortcutCaptureAccess';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { StorageError } from '../src/shared/domain/errors/AppError';
import { resolveUserIdToUUID, UserLookupError } from '../src/shared/application/helpers/userIdResolver';
import { buildServer } from '../src/delivery/web/express/expressServer';
import { RU } from '../src/delivery/messaging/telegram/i18n/ru';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { RecordPaymentUseCase } from '../src/modules/voiceProcessing/application/recordPayment';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { QuickCaptureService } from '../src/modules/quickCapture/application/quickCaptureService';
import { QuickCaptureModule } from '../src/modules/quickCapture/quickCaptureModule';
import { TransactionModule } from '../src/modules/transaction/transactionModule';
import { SqliteTransactionRepository } from '../src/modules/transaction/infrastructure/persistence/SqliteTransactionRepository';
import { CategoryModule } from '../src/modules/category/categoryModule';
import { SqliteCategoryRepository } from '../src/modules/category/infrastructure/SqliteCategoryRepository';
import { AccountModule } from '../src/modules/account/accountModule';
import { SqliteAccountRepository } from '../src/modules/account/infrastructure/SqliteAccountRepository';
import { SqliteAccountMoveRepository } from '../src/modules/account/infrastructure/SqliteAccountMoveRepository';
import { BotMessageModule } from '../src/modules/botMessage/botMessageModule';
import { SqliteBotMessageRepository } from '../src/modules/botMessage/infrastructure/SqliteBotMessageRepository';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { DatabaseFile, openMigratedDatabase, prepareDatabaseOnce, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { listenOnLoopback } from './helpers/testServer';
import { TelegramStand } from './helpers/telegramStand';

// ffmpeg is faked: a real one on fake audio is one more process per voice test (#295)
jest.mock('child_process', () => jest.requireActual('./helpers/fakeFfmpeg').childProcessWithFakeFfmpeg());

// A voice message is not downloaded in tests
jest.mock('../src/delivery/messaging/telegram/utils/fileDownloader', () => ({
  ...jest.requireActual('../src/delivery/messaging/telegram/utils/fileDownloader'),
  downloadVoiceFile: jest.fn(async (_url: string, fileId: string) => `/tmp/voice/${fileId}.ogg`),
  cleanupFile: jest.fn(async () => undefined),
}));

/**
 * #315: the user of a capture is looked up before anything is written. When the lookup fails — the database is busy —
 * the capture used to go on under the Telegram id itself: a record no screen and no total reads, for they read by the
 * user's own id. Now nothing is written and the answer is the one of a failed write (#299): the client sends the
 * capture again, the bot asks the person to. Real SQLite; only the `users` lookup is made to fail.
 */

const TELEGRAM_ID = 131184740;

/** The `users` lookup fails as a busy database does, until `restore()`; every other query goes to the database. */
function userLookupDown(): { restore(): void } {
  const getOrCreate = SqliteUserRepository.prototype.getOrCreate;
  let down = true;
  jest.spyOn(SqliteUserRepository.prototype, 'getOrCreate').mockImplementation(async function (this: SqliteUserRepository, dto) {
    if (down) throw new Error('SQLITE_BUSY: database is locked');
    return getOrCreate.call(this, dto);
  });
  return { restore: () => { down = false; } };
}

/** Every record with the Telegram id of the user it is written for; `null` — for no user: a phantom. */
async function recordOwners(dataSource: DataSource): Promise<Array<{ telegramId: string | null; amountMinor: number; clientId: string | null }>> {
  const rows = await dataSource.query(
    `SELECT u.telegram_id AS telegramId, t.amount_minor AS amountMinor, t.client_id AS clientId
     FROM transactions t LEFT JOIN users u ON u.id = t."userId" ORDER BY t.rowid`
  );
  return rows.map((row: { telegramId: unknown; amountMinor: unknown; clientId: string | null }) => ({
    telegramId: row.telegramId === null ? null : String(row.telegramId),
    amountMinor: Number(row.amountMinor),
    clientId: row.clientId,
  }));
}

describe('resolveUserIdToUUID when the lookup fails (#315)', () => {
  const brokenUserModule = {
    getGetOrCreateUserUseCase: () => ({ execute: jest.fn().mockRejectedValue(new Error('SQLITE_BUSY: database is locked')) }),
  } as unknown as UserModule;

  it('throws a 500 without the cause instead of answering the Telegram id', async () => {
    const failed = await resolveUserIdToUUID('555555555', brokenUserModule).catch(error => error);

    expect(failed).toBeInstanceOf(UserLookupError);
    expect(failed).toBeInstanceOf(StorageError);
    expect(failed.statusCode).toBe(500);
    expect(failed.message).not.toMatch(/SQLITE|locked|555555555/);
  });
});

describe('POST /api/quick-capture when the user lookup fails (#315)', () => {
  const OWNER = String(TELEGRAM_ID);
  const TOKEN = 'k'.repeat(MIN_PRODUCTION_SHORTCUT_TOKEN_LENGTH + 8);
  const CLIENT_ID = '0b7e1c52-9a3d-4e7f-8c21-5d6f7a8b9c0d';
  const taxi = { intent: 'transaction', amount: 18000, category: 'Транспорт', type: 'expense', date: '2026-11-18', description: 'такси' };
  /** Any module method buildServer calls gives an empty object: these tests go only to /api/quick-capture. */
  const unusedModule = new Proxy({}, { get: () => () => ({}) }) as any;
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    SHORTCUT_CAPTURE_TOKEN: process.env.SHORTCUT_CAPTURE_TOKEN,
    SHORTCUT_CAPTURE_OWNER: process.env.SHORTCUT_CAPTURE_OWNER,
  };
  let db: TestDatabase;
  let server: http.Server;
  let baseUrl: string;
  let openAI: { analyzeInput: jest.Mock; categoryOfMerchant: jest.Mock };

  beforeEach(async () => {
    process.env.NODE_ENV = 'production';
    process.env.SHORTCUT_CAPTURE_TOKEN = TOKEN;
    process.env.SHORTCUT_CAPTURE_OWNER = OWNER;
    jest.replaceProperty(AppConfig, 'TELEGRAM_ACCESS', telegramAccess([OWNER]));

    db = await openMigratedDatabase();
    const records = recordsOn(db.dataSource);
    openAI = {
      analyzeInput: jest.fn().mockResolvedValue({ transactions: [taxi], debts: [] }),
      categoryOfMerchant: jest.fn().mockResolvedValue('Продукты'),
    };
    const parser = openAI as unknown as TranscriptionService;
    const service = new QuickCaptureService(
      new ProcessTextInputUseCase(parser, records.create, undefined, records.catalog),
      records.repository,
      undefined,
      new RecordPaymentUseCase(parser, records.create, records.catalog)
    );
    const userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));

    const app = express();
    app.use('/api', buildServer(unusedModule, userModule, undefined, new QuickCaptureModule(service)));
    ({ server, baseUrl } = await listenOnLoopback(app));
  });

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.restoreAllMocks();
  });

  async function post(path: string, body: Record<string, unknown>) {
    const res = await fetch(`${baseUrl}/api/quick-capture${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shortcut-Capture-Token': TOKEN },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  const notLookedUp = {
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'The user could not be looked up, send it again', timestamp: expect.any(String) },
  };

  it('a phrase: 500 without the cause, nothing written or parsed; the same clientId sent again writes once, for the user', async () => {
    const phrase = { text: 'ехали на такси. Вышло 18к', clientId: CLIENT_ID };
    const lookup = userLookupDown();

    const failed = await post('', phrase);

    expect(failed.status).toBe(500);
    expect(failed.body).toEqual(notLookedUp);
    expect(await recordOwners(db.dataSource)).toEqual([]);
    expect(openAI.analyzeInput).not.toHaveBeenCalled();

    lookup.restore();
    const again = await post('', phrase);
    const third = await post('', phrase);

    expect(again.status).toBe(200);
    expect(again.body.data.repeated).toBeUndefined();
    expect(third.body.data.repeated).toBe(true);
    expect(await recordOwners(db.dataSource)).toEqual([{ telegramId: OWNER, amountMinor: 1_800_000, clientId: CLIENT_ID }]);
  });

  it('an Apple Pay payment: the same 500, nothing written; sent again it is written once, for the user', async () => {
    const payment = { amount: '25000', currency: 'UZS', merchant: 'KORZINKA 24', clientId: CLIENT_ID };
    const lookup = userLookupDown();

    const failed = await post('/payment', payment);

    expect(failed.status).toBe(500);
    expect(failed.body).toEqual(notLookedUp);
    expect(await recordOwners(db.dataSource)).toEqual([]);
    expect(openAI.categoryOfMerchant).not.toHaveBeenCalled();

    lookup.restore();
    const again = await post('/payment', payment);
    const third = await post('/payment', payment);

    expect(again.status).toBe(200);
    expect(third.body.data.repeated).toBe(true);
    expect(await recordOwners(db.dataSource)).toEqual([{ telegramId: OWNER, amountMinor: 2_500_000, clientId: CLIENT_ID }]);
  });
});

describe('the bot when the user lookup fails (#315)', () => {
  const migrated = prepareDatabaseOnce();
  let db: DatabaseFile;
  let ds: DataSource;
  let stand: TelegramStand;
  const parser = { transcribe: jest.fn(), analyzeInput: jest.fn(), analyzeTransactions: jest.fn() };
  const coffee = { intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense', date: '2026-11-18', description: 'кофе' };

  const sent = () => stand.sent().map(message => message.text);
  const lastSent = () => sent().slice(-1)[0];

  beforeEach(async () => {
    parser.transcribe.mockReset();
    parser.analyzeInput.mockReset().mockResolvedValue({ transactions: [coffee], debts: [] });
    parser.analyzeTransactions.mockReset();
    db = migrated.newFile();
    ds = await db.open();
    jest.spyOn(AppConfig, 'getWebAppUrl').mockReturnValue('https://miniapp.test');
    stand = new TelegramStand({ id: TELEGRAM_ID, first_name: 'Shukur' });
    stand.install();

    const categoryModule = new CategoryModule(new SqliteCategoryRepository(ds));
    const accountModule = new AccountModule(new SqliteAccountRepository(ds), undefined, new SqliteAccountMoveRepository(ds));
    const transactionModule = new TransactionModule(new SqliteTransactionRepository(ds));
    transactionModule.setCategoryResolver(categoryModule.getCatalog());
    transactionModule.setAccountResolver(accountModule.getBook());
    const userModule = new UserModule(new SqliteUserRepository(ds), new SqliteUserSettingsRepository(ds));
    const service = parser as unknown as TranscriptionService;
    const create = transactionModule.getCreateTransactionUseCase();
    const quickCapture = new QuickCaptureService(new ProcessTextInputUseCase(service, create), transactionModule);
    const voice = new ProcessVoiceInputUseCase(service, create);
    stand.start({
      transactionModule,
      accountModule,
      categoryModule,
      userModule,
      botMessageModule: new BotMessageModule(new SqliteBotMessageRepository(ds)),
      subscriptionModule: {
        getCheckLimitUseCase: () => ({ execute: async () => ({ allowed: true, isPremium: false, currentUsage: 0, limit: 50, remaining: 50 }) }),
        getIncrementUsageUseCase: () => ({ execute: async () => undefined }),
      },
      quickCaptureModule: { getQuickCaptureService: () => quickCapture },
      voiceModule: { getProcessVoiceInputUseCase: () => voice },
    });
    // The person is known to the bot: the lookup that fails below is of a user who is there
    await resolveUserIdToUUID(String(TELEGRAM_ID), userModule);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await db.remove();
  });

  it('a text: nothing is written or parsed, the bot asks to send it again; sent again it is written once, for the user', async () => {
    const lookup = userLookupDown();

    await stand.write('кофе 25 тысяч');

    expect(lastSent()).toBe(RU.capture.notSaved);
    expect(await recordOwners(ds)).toEqual([]);
    expect(parser.analyzeInput).not.toHaveBeenCalled();

    lookup.restore();
    await stand.write('кофе 25 тысяч');

    expect(await recordOwners(ds)).toEqual([expect.objectContaining({ telegramId: String(TELEGRAM_ID), amountMinor: 2_500_000 })]);
    expect(lastSent()).toContain('Кофе');
  });

  it('a voice: not downloaded or heard, the bot asks to say it again; said again it is written once, for the user', async () => {
    jest.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
    jest.spyOn(fsPromises, 'rename').mockResolvedValue(undefined);
    jest.spyOn(fsPromises, 'unlink').mockResolvedValue(undefined);
    parser.transcribe.mockResolvedValue('кофе 25 тысяч');
    const lookup = userLookupDown();

    await stand.say();

    expect(lastSent()).toBe(RU.capture.notSavedVoice);
    expect(await recordOwners(ds)).toEqual([]);
    expect(parser.transcribe).not.toHaveBeenCalled();

    lookup.restore();
    await stand.say();

    expect(await recordOwners(ds)).toEqual([expect.objectContaining({ telegramId: String(TELEGRAM_ID), amountMinor: 2_500_000 })]);
  });

  it('the answer to «Сколько?»: nothing is written and the question stays open; answered again it is written once, for the user', async () => {
    const taxi = { description: 'такси', category: 'Транспорт', type: 'expense', date: '2026-11-18' };
    parser.analyzeInput.mockImplementation(async (text: string) => (text === 'такси'
      ? { transactions: [], debts: [], withoutAmount: [taxi] }
      : { transactions: [{ ...coffee, amount: 18000, category: 'Другое', description: text }], debts: [] }));
    await stand.write('такси');
    expect(lastSent()).toContain('Сколько?');
    const parsed = parser.analyzeInput.mock.calls.length;
    const lookup = userLookupDown();

    await stand.write('18 тысяч');

    expect(lastSent()).toBe(RU.capture.notSaved);
    expect(await recordOwners(ds)).toEqual([]);
    // Not read as a phrase of its own either
    expect(parser.analyzeInput).toHaveBeenCalledTimes(parsed);

    lookup.restore();
    await stand.write('18 тысяч');

    expect(await recordOwners(ds)).toEqual([expect.objectContaining({ telegramId: String(TELEGRAM_ID), amountMinor: 1_800_000 })]);
    const [{ description }] = await ds.query('SELECT description FROM transactions');
    expect(description).toBe('такси');
  });

  it('a button under a record changes nothing and says so, instead of «Не нашёл эту запись»', async () => {
    await stand.write('кофе 25 тысяч');
    const confirmation = stand.sent().slice(-1)[0];
    const before = await ds.query('SELECT * FROM transactions');
    userLookupDown();

    const answers = await stand.pressData(confirmation.messageId, confirmation.keyboard.flat()[0].callback_data!);

    expect(answers).toEqual([RU.errors.generic]);
    expect(await ds.query('SELECT * FROM transactions')).toEqual(before);
  });
});
