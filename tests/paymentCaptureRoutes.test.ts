import 'reflect-metadata';
import express from 'express';
import http from 'http';
import { telegramAccess } from '../src/shared/domain/access/telegramAccess';
import { MIN_PRODUCTION_SHORTCUT_TOKEN_LENGTH } from '../src/shared/domain/access/shortcutCaptureAccess';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { buildServer } from '../src/delivery/web/express/expressServer';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { RecordPaymentUseCase } from '../src/modules/voiceProcessing/application/recordPayment';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { QuickCaptureService } from '../src/modules/quickCapture/application/quickCaptureService';
import { QuickCaptureModule } from '../src/modules/quickCapture/quickCaptureModule';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { listenOnLoopback } from './helpers/testServer';
import { todayDateOnly } from '../src/shared/domain/dates/dateOnly';

/**
 * FT-176: POST /api/quick-capture/payment — a card payment from Apple Pay with its amount, currency, merchant and
 * card's account, on the live instance (NODE_ENV=production) by the owner's Shortcut token, as a phrase is (FT-155).
 */

const OWNER = '900000143';
const OTHER_ALLOWED = '111';
const TOKEN = 'k'.repeat(MIN_PRODUCTION_SHORTCUT_TOKEN_LENGTH + 8);
const CLIENT_ID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const PAYMENT = { amount: '25000', currency: 'UZS', merchant: 'KORZINKA 24', clientId: CLIENT_ID };

/** Any module method buildServer calls gives an empty object: these tests go only to /api/quick-capture. */
const unusedModule = new Proxy({}, { get: () => () => ({}) }) as any;

describe('POST /api/quick-capture/payment (FT-176)', () => {
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
    jest.replaceProperty(AppConfig, 'TELEGRAM_ACCESS', telegramAccess([OWNER, OTHER_ALLOWED]));

    db = await openMigratedDatabase();
    const records = recordsOn(db.dataSource);
    openAI = { analyzeInput: jest.fn(), categoryOfMerchant: jest.fn().mockResolvedValue('Продукты') };
    const parser = openAI as unknown as TranscriptionService;
    const service = new QuickCaptureService(
      new ProcessTextInputUseCase(parser, records.create, undefined, records.catalog),
      records.repository,
      undefined,
      new RecordPaymentUseCase(parser, records.create, records.catalog)
    );
    const userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));

    const app = express();
    app.use('/api', buildServer(unusedModule, unusedModule, unusedModule, unusedModule, userModule, undefined, new QuickCaptureModule(service)));
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

  async function pay(body: Record<string, unknown>, headers: Record<string, string> = { 'X-Shortcut-Capture-Token': TOKEN }) {
    const res = await fetch(`${baseUrl}/api/quick-capture/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  async function written(): Promise<Array<{ telegramId: string; source: string; amountMinor: number; currency: string; merchant: string }>> {
    const rows = await db.dataSource.query(
      `SELECT u.telegram_id AS telegramId, t.source AS source, t.amount_minor AS amountMinor, t.currency AS currency, t.merchant AS merchant
       FROM transactions t JOIN users u ON u.id = t."userId" ORDER BY t.rowid`
    );
    return rows.map((row: { telegramId: string }) => ({ ...row, telegramId: String(row.telegramId) }));
  }

  it('writes the payment for the owner as it came, with the source apple_pay', async () => {
    const res = await pay({ ...PAYMENT, amount: '500', merchant: 'EVOS' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, message: 'Quick capture processed' });
    expect(res.body.data).toMatchObject({ source: 'apple_pay', text: 'EVOS', status: 'needs_review' });
    expect(res.body.data.transactions[0]).toMatchObject({
      amount: 500, amountMinor: 50_000, currency: 'UZS', category: 'Кафе', merchant: 'EVOS', date: todayDateOnly(),
    });
    expect(res.body.data.ack).toMatchObject({ title: 'Нужно проверить', summary: 'EVOS · 500 сум · Кафе' });
    expect(await written()).toEqual([{ telegramId: OWNER, source: 'apple_pay', amountMinor: 50_000, currency: 'UZS', merchant: 'EVOS' }]);
    expect(openAI.analyzeInput).not.toHaveBeenCalled();
  });

  it('writes 4.50 dollars as 4.50', async () => {
    const res = await pay({ ...PAYMENT, amount: '4.50', currency: 'USD' });

    expect(res.status).toBe(200);
    expect(res.body.data.transactions[0]).toMatchObject({ amount: 4.5, amountMinor: 450, currency: 'USD' });
  });

  // Сумы are whole (Shukur, 2026-10-30, FT-185): Wallet may give «1 234,50 UZS»; dollars keep their cents
  it.each([
    ['1234.50', 123_500],
    ['1234.49', 123_400],
    ['28000.00', 2_800_000],
    ['0.50', 100],
  ])('writes %s сум in whole сум, %d minor units', async (amount, amountMinor) => {
    const res = await pay({ ...PAYMENT, amount, currency: 'UZS' });

    expect(res.status).toBe(200);
    expect(res.body.data.transactions[0]).toMatchObject({ amountMinor, currency: 'UZS' });
    expect(await written()).toEqual([expect.objectContaining({ amountMinor, currency: 'UZS' })]);
  });

  it('ignores the userId, source and text the body names', async () => {
    const res = await pay({ ...PAYMENT, userId: OTHER_ALLOWED, source: 'miniapp', text: 'кофе 500' });

    expect(res.status).toBe(200);
    expect(await written()).toEqual([expect.objectContaining({ telegramId: OWNER, source: 'apple_pay', amountMinor: 2_500_000 })]);
  });

  it.each([
    ['a currency other than UZS and USD', { currency: 'EUR' }, 'currency'],
    ['a lowercase currency', { currency: 'uzs' }, 'currency'],
    ['no currency', { currency: undefined }, 'currency'],
    ['an amount as a number', { amount: 500 }, 'amount'],
    ['an amount with a comma', { amount: '4,50' }, 'amount'],
    ['an amount with three decimals', { amount: '4.505' }, 'amount'],
    ['no amount', { amount: undefined }, 'amount'],
    ['a zero amount', { amount: '0' }, 'amount'],
    ['less than half a сум, which is no whole сум', { amount: '0.49', currency: 'UZS' }, 'amount'],
    ['an amount over the limit of a record', { amount: '1000000001' }, 'amount'],
    ['a merchant that is not a string', { merchant: 24 }, 'merchant'],
    ['a merchant longer than 200 characters', { merchant: 'K'.repeat(201) }, 'merchant'],
    ['an account name longer than 100 characters', { accountName: 'H'.repeat(101) }, 'accountName'],
    ['no clientId', { clientId: undefined }, 'clientId'],
    ['a clientId with «:»', { clientId: 'abc:1' }, 'clientId'],
    ['a capturedAt without a zone', { capturedAt: '2026-10-27T09:15:00' }, 'capturedAt'],
  ])('refuses %s with 400 and writes nothing', async (_why, change, field) => {
    const res = await pay({ ...PAYMENT, ...change });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', context: { field } });
    expect(await written()).toEqual([]);
    expect(openAI.categoryOfMerchant).not.toHaveBeenCalled();
  });

  it('refuses a capturedAt older than 30 days with 400 and writes nothing', async () => {
    const res = await pay({ ...PAYMENT, capturedAt: new Date(Date.now() - 40 * 86_400_000).toISOString() });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'capturedAt is older than 30 days' });
    expect(await written()).toEqual([]);
  });

  it('a repeat with the same clientId answers with the first record and writes nothing', async () => {
    const first = await pay(PAYMENT);
    const repeat = await pay(PAYMENT);

    expect(repeat.status).toBe(200);
    expect(repeat.body.data.repeated).toBe(true);
    expect(repeat.body.data.transactions.map((t: { id: string }) => t.id)).toEqual(first.body.data.transactions.map((t: { id: string }) => t.id));
    expect(await written()).toHaveLength(1);
    expect(openAI.categoryOfMerchant).toHaveBeenCalledTimes(1);
  });

  it('answers a wrong token with 401 and a header naming someone else with 403, as for a phrase', async () => {
    const wrongToken = await pay(PAYMENT, { 'X-Shortcut-Capture-Token': `${TOKEN}x` });
    const someoneElse = await pay(PAYMENT, { 'X-Shortcut-Capture-Token': TOKEN, 'X-Shortcut-User-Id': OTHER_ALLOWED });
    const noAuth = await pay(PAYMENT, {});

    expect(wrongToken).toMatchObject({ status: 401, body: { code: 'INVALID_SHORTCUT_TOKEN' } });
    expect(someoneElse).toMatchObject({ status: 403, body: { code: 'ACCESS_DENIED' } });
    expect(noAuth).toMatchObject({ status: 401, body: { code: 'MISSING_AUTH_HEADER' } });
    expect(await written()).toEqual([]);
  });

  it('a phrase still goes to POST /api/quick-capture with the source ios_shortcut', async () => {
    openAI.analyzeInput.mockResolvedValue({ transactions: [], debts: [] });
    const res = await fetch(`${baseUrl}/api/quick-capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shortcut-Capture-Token': TOKEN },
      body: JSON.stringify({ text: 'кофе 25000' }),
    });

    expect(res.status).toBe(200);
    expect(await written()).toEqual([expect.objectContaining({ source: 'ios_shortcut', amountMinor: 2_500_000 })]);
  });
});
