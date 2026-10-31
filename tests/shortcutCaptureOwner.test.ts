import 'reflect-metadata';
import express from 'express';
import http from 'http';
import { telegramAccess } from '../src/shared/domain/access/telegramAccess';
import {
  MIN_PRODUCTION_SHORTCUT_TOKEN_LENGTH,
  shortcutCaptureAccess,
} from '../src/shared/domain/access/shortcutCaptureAccess';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { buildServer } from '../src/delivery/web/express/expressServer';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { TranscriptionService } from '../src/modules/voiceProcessing/domain/transcriptionService';
import { QuickCaptureService } from '../src/modules/quickCapture/application/quickCaptureService';
import { QuickCaptureModule } from '../src/modules/quickCapture/quickCaptureModule';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { appConfigWith } from './helpers/appConfigWith';
import { listenOnLoopback } from './helpers/testServer';
import { todayDateOnly } from '../src/shared/domain/dates/dateOnly';

/**
 * FT-155: the iPhone Shortcut writes on the live instance (NODE_ENV=production, decision 2026-10-26) with a token bound
 * to one owner, SHORTCUT_CAPTURE_OWNER. The token holder no longer chooses the owner by X-Shortcut-User-Id.
 */

const OWNER = '900000143';
const OTHER_ALLOWED = '111';
const STRANGER = '222';
const TOKEN = 'k'.repeat(MIN_PRODUCTION_SHORTCUT_TOKEN_LENGTH + 8);
const SHORT_TOKEN = 's'.repeat(MIN_PRODUCTION_SHORTCUT_TOKEN_LENGTH - 1);
const CLIENT_ID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';

describe('the Shortcut capture setting (FT-155)', () => {
  const access = telegramAccess([OWNER]);
  const production = { production: true, access };

  it('in production is on with a long token and an owner on the list', () => {
    expect(shortcutCaptureAccess({ token: TOKEN, owner: OWNER }, production)).toEqual({
      token: TOKEN, owner: OWNER, enabled: true, problems: [],
    });
  });

  it('in production is off, without a problem, when neither is set: no Shortcut on this instance', () => {
    expect(shortcutCaptureAccess({ token: '', owner: '  ' }, production)).toMatchObject({ enabled: false, problems: [] });
    expect(shortcutCaptureAccess({}, production)).toMatchObject({ enabled: false, problems: [] });
  });

  it('reads the owner as a number, as the list does: leading zeros name the same id', () => {
    expect(shortcutCaptureAccess({ token: TOKEN, owner: ` 0${OWNER} ` }, production)).toMatchObject({ owner: OWNER, enabled: true });
  });

  it.each([
    ['a token shorter than 32 characters', { token: SHORT_TOKEN, owner: OWNER }, /SHORTCUT_CAPTURE_TOKEN.*32/],
    // Since FT-218 the token also reads and edits the owner's records: the message says so
    ['a token without an owner', { token: TOKEN }, /without SHORTCUT_CAPTURE_OWNER.*writes, reads and edits records only for its owner/],
    ['an owner without a token', { owner: OWNER }, /SHORTCUT_CAPTURE_TOKEN/],
    ['an owner not on the list', { token: TOKEN, owner: STRANGER }, /SHORTCUT_CAPTURE_OWNER.*ALLOWED_TELEGRAM_IDS/],
    ['an owner that is not one Telegram id', { token: TOKEN, owner: `${OWNER},${OTHER_ALLOWED}` }, /SHORTCUT_CAPTURE_OWNER/],
  ])('in production is off with a problem for %s', (_, env, problem) => {
    const setting = shortcutCaptureAccess(env, production);
    expect(setting.enabled).toBe(false);
    expect(setting.problems).toEqual([expect.stringMatching(problem)]);
  });

  it('never names the token in a problem', () => {
    const setting = shortcutCaptureAccess({ token: SHORT_TOKEN, owner: STRANGER }, production);
    expect(setting.problems.join(' ')).not.toContain(SHORT_TOKEN);
  });

  it('never prints an owner that is not an id: it may be the token put in the wrong variable', () => {
    const setting = shortcutCaptureAccess({ token: TOKEN, owner: TOKEN }, production);
    expect(setting.problems).toEqual([expect.stringMatching(/SHORTCUT_CAPTURE_OWNER/)]);
    expect(setting.problems.join(' ')).not.toContain(TOKEN.slice(0, 8));
  });

  it('outside production keeps the old rules: any token, the owner optional', () => {
    const development = { production: false, access: telegramAccess([]) };
    expect(shortcutCaptureAccess({ token: 'short' }, development)).toMatchObject({ enabled: true, owner: null, problems: [] });
    expect(shortcutCaptureAccess({}, development)).toMatchObject({ enabled: true, token: '', owner: null, problems: [] });
    expect(shortcutCaptureAccess({ owner: OWNER }, development)).toMatchObject({ enabled: true, owner: OWNER, problems: [] });
  });

  it('outside production an owner that is no Telegram id or not on the list is still a problem', () => {
    const development = { production: false, access: telegramAccess([OWNER]) };
    expect(shortcutCaptureAccess({ owner: '@shukur' }, development)).toMatchObject({ enabled: false, problems: [expect.any(String)] });
    expect(shortcutCaptureAccess({ owner: STRANGER }, development)).toMatchObject({ enabled: false, problems: [expect.any(String)] });
  });
});

describe('the start with a Shortcut setting (FT-155)', () => {
  const productionEnv = { NODE_ENV: 'production', ALLOWED_TELEGRAM_IDS: OWNER };

  it('in production goes on with a long token and an allowed owner, or with neither', () => {
    expect(appConfigWith({ ...productionEnv, SHORTCUT_CAPTURE_TOKEN: TOKEN, SHORTCUT_CAPTURE_OWNER: OWNER }).validate())
      .toEqual({ isValid: true, errors: [] });
    expect(appConfigWith(productionEnv).validate()).toEqual({ isValid: true, errors: [] });
  });

  it('in production stops on a short token, a missing half or an owner off the list, without naming the token', () => {
    const settings: Array<Record<string, string>> = [
      { SHORTCUT_CAPTURE_TOKEN: SHORT_TOKEN, SHORTCUT_CAPTURE_OWNER: OWNER },
      { SHORTCUT_CAPTURE_TOKEN: TOKEN },
      { SHORTCUT_CAPTURE_OWNER: OWNER },
      { SHORTCUT_CAPTURE_TOKEN: TOKEN, SHORTCUT_CAPTURE_OWNER: STRANGER },
    ];
    for (const env of settings) {
      const { isValid, errors } = appConfigWith({ ...productionEnv, ...env }).validate();
      expect(isValid).toBe(false);
      expect(errors).toEqual([expect.stringMatching(/SHORTCUT_CAPTURE_/)]);
      expect(errors.join(' ')).not.toMatch(/kkkk|ssss/);
    }
  });

  it('outside production goes on with a short token and no owner, as before', () => {
    expect(appConfigWith({ NODE_ENV: 'development', SHORTCUT_CAPTURE_TOKEN: 'short' }).validate()).toEqual({ isValid: true, errors: [] });
  });

  it('stops everywhere on an owner that is not a Telegram id, without printing it', () => {
    for (const NODE_ENV of ['development', 'production']) {
      const { isValid, errors } = appConfigWith({ ...productionEnv, NODE_ENV, SHORTCUT_CAPTURE_TOKEN: TOKEN, SHORTCUT_CAPTURE_OWNER: '@shukur' }).validate();
      expect(isValid).toBe(false);
      expect(errors).toEqual([expect.stringMatching(/SHORTCUT_CAPTURE_OWNER/)]);
      expect(errors.join(' ')).not.toContain('@shukur');
    }
  });
});

/** Any module method buildServer calls gives an empty object: these tests go only to /api/quick-capture. */
const unusedModule = new Proxy({}, { get: () => () => ({}) }) as any;

describe('POST /api/quick-capture from the iPhone in production (FT-155)', () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    SHORTCUT_CAPTURE_TOKEN: process.env.SHORTCUT_CAPTURE_TOKEN,
    SHORTCUT_CAPTURE_OWNER: process.env.SHORTCUT_CAPTURE_OWNER,
  };
  let db: TestDatabase;
  let server: http.Server;
  let baseUrl: string;
  let analyzeInput: jest.Mock;

  beforeEach(async () => {
    process.env.NODE_ENV = 'production';
    process.env.SHORTCUT_CAPTURE_TOKEN = TOKEN;
    process.env.SHORTCUT_CAPTURE_OWNER = OWNER;
    jest.replaceProperty(AppConfig, 'TELEGRAM_ACCESS', telegramAccess([OWNER, OTHER_ALLOWED]));

    db = await openMigratedDatabase();
    const records = recordsOn(db.dataSource);
    analyzeInput = jest.fn().mockResolvedValue({
      transactions: [{ intent: 'transaction', amount: 25000, category: 'Кафе', type: 'expense', date: '2026-10-27', description: 'кофе' }],
      debts: [],
    });
    const pipeline = new ProcessTextInputUseCase({ analyzeInput } as unknown as TranscriptionService, records.create, undefined, records.catalog);
    const quickCaptureModule = new QuickCaptureModule(new QuickCaptureService(pipeline, records.repository));
    const userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));

    const app = express();
    app.use('/api', buildServer(unusedModule, unusedModule, unusedModule, unusedModule, userModule, undefined, quickCaptureModule));
    // The test server starts the shared AI limiter (20 per address) with empty counters
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

  async function capture(headers: Record<string, string>, body: Record<string, unknown> = { text: 'кофе 25000' }) {
    const res = await fetch(`${baseUrl}/api/quick-capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  /** Telegram ids of the owners of the written records, and their sources. */
  async function written(): Promise<Array<{ telegramId: string; source: string }>> {
    const rows = await db.dataSource.query(
      'SELECT u.telegram_id AS telegramId, t.source AS source FROM transactions t JOIN users u ON u.id = t."userId"'
    );
    return rows.map((row: { telegramId: string; source: string }) => ({ telegramId: String(row.telegramId), source: row.source }));
  }

  const usersInDb = async () => (await db.dataSource.query('SELECT telegram_id FROM users')).map((row: { telegram_id: string }) => String(row.telegram_id));

  it('writes for the owner with the token alone', async () => {
    const res = await capture({ 'X-Shortcut-Capture-Token': TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'saved', source: 'ios_shortcut' });
    expect(await written()).toEqual([{ telegramId: OWNER, source: 'ios_shortcut' }]);
  });

  it('accepts X-Shortcut-User-Id naming the owner, with leading zeros too', async () => {
    expect((await capture({ 'X-Shortcut-Capture-Token': TOKEN, 'X-Shortcut-User-Id': OWNER })).status).toBe(200);
    expect((await capture({ 'X-Shortcut-Capture-Token': TOKEN, 'X-Shortcut-User-Id': `0${OWNER}` })).status).toBe(200);
    expect((await written()).map(record => record.telegramId)).toEqual([OWNER, OWNER]);
  });

  it('refuses X-Shortcut-User-Id naming anyone else, on the list or not, with 403 and writes nothing', async () => {
    for (const someoneElse of [OTHER_ALLOWED, STRANGER, 'not-an-id']) {
      const res = await capture({ 'X-Shortcut-Capture-Token': TOKEN, 'X-Shortcut-User-Id': someoneElse });
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ success: false, code: 'ACCESS_DENIED' });
    }
    expect(await written()).toEqual([]);
    expect(await usersInDb()).toEqual([]);
    expect(analyzeInput).not.toHaveBeenCalled();
  });

  it('writes for the owner whatever userId and source the body names', async () => {
    const res = await capture({ 'X-Shortcut-Capture-Token': TOKEN }, { text: 'кофе 25000', userId: OTHER_ALLOWED, source: 'miniapp' });

    expect(res.status).toBe(200);
    expect(await written()).toEqual([{ telegramId: OWNER, source: 'ios_shortcut' }]);
  });

  it('answers a wrong, empty or missing token with 401 INVALID_SHORTCUT_TOKEN, before saying anything about the owner', async () => {
    const attempts: Array<Record<string, string>> = [
      { 'X-Shortcut-Capture-Token': `${TOKEN}x` },
      { 'X-Shortcut-Capture-Token': TOKEN.slice(1) },
      { 'X-Shortcut-Capture-Token': '' },
      { 'X-Shortcut-Capture-Token': 'wrong', 'X-Shortcut-User-Id': STRANGER },
      { 'X-Shortcut-User-Id': OWNER },
    ];
    for (const headers of attempts) {
      const res = await capture(headers);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ success: false, code: 'INVALID_SHORTCUT_TOKEN' });
    }
    expect(await written()).toEqual([]);
  });

  it('a repeat with the same clientId writes nothing new and answers with the first record', async () => {
    const first = await capture({ 'X-Shortcut-Capture-Token': TOKEN }, { text: 'кофе 25000', clientId: CLIENT_ID });
    const repeat = await capture({ 'X-Shortcut-Capture-Token': TOKEN }, { text: 'кофе 25000', clientId: CLIENT_ID });

    expect(first.status).toBe(200);
    expect(repeat.status).toBe(200);
    expect(repeat.body.data.repeated).toBe(true);
    expect(repeat.body.data.transactions.map((t: { id: string }) => t.id)).toEqual(first.body.data.transactions.map((t: { id: string }) => t.id));
    expect(await written()).toHaveLength(1);
    expect(analyzeInput.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('dates a capture by its time of input and answers its repeat whatever time the repeat carries (FT-175)', async () => {
    const typedAt = new Date(Date.now() - 2 * 86_400_000);
    const first = await capture({ 'X-Shortcut-Capture-Token': TOKEN }, { text: 'кофе 25000', clientId: CLIENT_ID, capturedAt: typedAt.toISOString() });
    const tooOld = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const repeat = await capture({ 'X-Shortcut-Capture-Token': TOKEN }, { text: 'кофе 25000', clientId: CLIENT_ID, capturedAt: tooOld });
    const fresh = await capture({ 'X-Shortcut-Capture-Token': TOKEN }, { text: 'чай 5000', clientId: `${CLIENT_ID.slice(0, -1)}0`, capturedAt: tooOld });

    expect(first.status).toBe(200);
    expect(first.body.data.transactions[0].date).toBe(todayDateOnly(typedAt));
    expect(repeat.status).toBe(200);
    expect(repeat.body.data.repeated).toBe(true);
    expect(repeat.body.data.transactions.map((t: { id: string }) => t.id)).toEqual(first.body.data.transactions.map((t: { id: string }) => t.id));
    expect(fresh.status).toBe(400);
    expect(fresh.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'capturedAt is older than 30 days' });
    expect(await written()).toHaveLength(1);
  });

  it('ignores X-Dev-User-Id, even from this machine: alone it is 401, with the token the record is the owner’s', async () => {
    const alone = await capture({ 'X-Dev-User-Id': OTHER_ALLOWED });
    expect(alone.status).toBe(401);
    expect(alone.body).toMatchObject({ code: 'MISSING_AUTH_HEADER' });

    const withToken = await capture({ 'X-Dev-User-Id': OTHER_ALLOWED, 'X-Shortcut-Capture-Token': TOKEN });
    expect(withToken.status).toBe(200);
    expect(await written()).toEqual([{ telegramId: OWNER, source: 'ios_shortcut' }]);
  });

  it('is 403 SHORTCUT_CAPTURE_DISABLED when the setting is missing or wrong, as before FT-155', async () => {
    const settings: Array<[string | undefined, string | undefined]> = [
      [undefined, undefined],
      [SHORT_TOKEN, OWNER],
      [TOKEN, undefined],
      [TOKEN, STRANGER],
    ];
    for (const [token, owner] of settings) {
      if (token === undefined) delete process.env.SHORTCUT_CAPTURE_TOKEN;
      else process.env.SHORTCUT_CAPTURE_TOKEN = token;
      if (owner === undefined) delete process.env.SHORTCUT_CAPTURE_OWNER;
      else process.env.SHORTCUT_CAPTURE_OWNER = owner;

      const res = await capture({ 'X-Shortcut-Capture-Token': token ?? TOKEN, 'X-Shortcut-User-Id': OWNER });
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ success: false, code: 'SHORTCUT_CAPTURE_DISABLED' });
    }
    expect(await written()).toEqual([]);
  });
});
