import 'reflect-metadata';
import crypto from 'crypto';
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { parseTelegramIds, telegramAccess } from '../src/shared/domain/access/telegramAccess';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { buildServer } from '../src/delivery/web/express/expressServer';
import { allowShortcutCapture } from '../src/delivery/web/express/middleware/authMiddleware';
import { AuthModule } from '../src/modules/auth/authModule';
import { SqliteLoginTokenRepository } from '../src/modules/auth/infrastructure/SqliteLoginTokenRepository';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { appConfigWith } from './helpers/appConfigWith';

/**
 * FT-153: closed access by ALLOWED_TELEGRAM_IDS (decision 2026-10-26, «живой экземпляр на своём ПК»). The bot, the API
 * and the notices are only for the Telegram ids on the list. An empty list lets everyone in outside production, as
 * before; production refuses to start without it.
 */


describe('the list of allowed Telegram ids (FT-153)', () => {
  it('takes ids separated by commas, with spaces and empty entries around them', () => {
    expect(parseTelegramIds(' 597843119, 111 ,,222,')).toEqual({ ids: ['597843119', '111', '222'], invalid: [] });
  });

  it('is empty when the variable is missing or blank', () => {
    expect(parseTelegramIds(undefined)).toEqual({ ids: [], invalid: [] });
    expect(parseTelegramIds('  ')).toEqual({ ids: [], invalid: [] });
  });

  it('names every entry that is not a Telegram user id instead of skipping it', () => {
    expect(parseTelegramIds('597843119, @shukur, 12a, -5, 0, 1.5, 111 222, 99999999999999999999')).toEqual({
      ids: ['597843119'],
      invalid: ['@shukur', '12a', '-5', '0', '1.5', '111 222', '99999999999999999999'],
    });
  });

  it('reads leading zeros as the same id', () => {
    expect(parseTelegramIds('00111')).toEqual({ ids: ['111'], invalid: [] });
  });

  it('lets in only the listed ids, given as a number or a string', () => {
    const access = telegramAccess(['597843119', '111']);
    expect(access.open).toBe(false);
    expect(access.allows(597843119)).toBe(true);
    expect(access.allows('111')).toBe(true);
    expect(access.allows(222)).toBe(false);
    expect(access.allows('597843119abc')).toBe(false);
    expect(access.allows(undefined)).toBe(false);
    expect(access.allows(null)).toBe(false);
  });

  it('lets everyone in when the list is empty', () => {
    const access = telegramAccess([]);
    expect(access.open).toBe(true);
    expect(access.allows(222)).toBe(true);
    expect(access.allows(undefined)).toBe(true);
  });
});

describe('ALLOWED_TELEGRAM_IDS in AppConfig (FT-153)', () => {
  it('keeps the parsed list and lets in only it', () => {
    const config = appConfigWith({ ALLOWED_TELEGRAM_IDS: '597843119, 111' });
    expect(config.ALLOWED_TELEGRAM_IDS).toEqual(['597843119', '111']);
    expect(config.TELEGRAM_ACCESS.allows(111)).toBe(true);
    expect(config.TELEGRAM_ACCESS.allows(222)).toBe(false);
    expect(config.validate()).toEqual({ isValid: true, errors: [] });
  });

  it('outside production an empty list lets everyone in, as before', () => {
    const config = appConfigWith({ NODE_ENV: 'development', ALLOWED_TELEGRAM_IDS: '' });
    expect(config.TELEGRAM_ACCESS.open).toBe(true);
    expect(config.validate()).toEqual({ isValid: true, errors: [] });
  });

  it('in production an empty list stops the start', () => {
    const config = appConfigWith({ NODE_ENV: 'production', ALLOWED_TELEGRAM_IDS: ' , ' });
    const { isValid, errors } = config.validate();
    expect(isValid).toBe(false);
    expect(errors).toEqual([expect.stringContaining('ALLOWED_TELEGRAM_IDS is required in production')]);
  });

  it('in production a list lets the start go on', () => {
    expect(appConfigWith({ NODE_ENV: 'production', ALLOWED_TELEGRAM_IDS: '597843119' }).validate()).toEqual({ isValid: true, errors: [] });
  });

  it('an entry that is not a Telegram id stops the start everywhere, naming the entry', () => {
    for (const NODE_ENV of ['development', 'production']) {
      const { isValid, errors } = appConfigWith({ NODE_ENV, ALLOWED_TELEGRAM_IDS: '597843119, @shukur' }).validate();
      expect(isValid).toBe(false);
      expect(errors).toEqual([expect.stringMatching(/ALLOWED_TELEGRAM_IDS.*@shukur/)]);
    }
  });
});

const BOT_TOKEN = 'test-bot-token-ft153';
const ALLOWED = 111;
const STRANGER = 222;

/** Telegram Mini App initData signed the way Telegram signs it (HMAC-SHA256 with the bot token). */
function initData(userId: number): string {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('user', JSON.stringify({ id: userId, first_name: 'Test' }));
  const dataCheckString = Array.from(params.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

/** Any module method buildServer calls gives an empty object: these tests go only to /api/settings and /api/health. */
const unusedModule = new Proxy({}, { get: () => () => ({}) }) as any;

describe('the API lets in only the allowed (FT-153)', () => {
  let db: TestDatabase;
  let userModule: UserModule;
  let authModule: AuthModule;
  let server: http.Server;
  let baseUrl: string;

  async function serve(allowed: string[]) {
    jest.replaceProperty(AppConfig, 'TELEGRAM_ACCESS', telegramAccess(allowed));
    jest.replaceProperty(AppConfig, 'TG_BOT_API_KEY', BOT_TOKEN);
    authModule = new AuthModule(new SqliteLoginTokenRepository(db.dataSource), { botUsername: { username: async () => 'DaftarBot' } });
    const app = express();
    app.use('/api', buildServer(unusedModule, unusedModule, unusedModule, unusedModule, unusedModule, userModule, undefined, undefined, { authModule }));
    server = await new Promise<http.Server>(resolve => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  async function get(path: string, headers: Record<string, string> = {}) {
    return call('GET', path, headers);
  }

  async function call(method: string, path: string, headers: Record<string, string> = {}) {
    const res = await fetch(`${baseUrl}${path}`, { method, headers });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, setCookie: res.headers.get('set-cookie') ?? '' };
  }

  /** The web login of a browser confirmed in the bot while the list was open: its waiting secret. */
  async function confirmedLogin(telegramId: number): Promise<string> {
    const openAuth = new AuthModule(new SqliteLoginTokenRepository(db.dataSource), {
      botUsername: { username: async () => 'DaftarBot' },
      access: telegramAccess([]),
    });
    const started = await openAuth.getStartWebLoginUseCase().execute({ userAgent: 'test' });
    if (!started.success) throw started.error;
    const token = new URL(started.data.link).searchParams.get('start')!.slice('login_'.length);
    const opened = await openAuth.getOpenLoginInBotUseCase().execute({ token, telegramId: String(telegramId) });
    if (!opened.success || opened.data.kind !== 'ask') throw new Error('The login did not open');
    await openAuth.getAnswerLoginUseCase().execute({ loginId: opened.data.loginId, telegramId: String(telegramId), answer: 'confirm' });
    return started.data.browserSecret;
  }

  /** A browser session for this Telegram id, issued while the list was open (for example before it changed). */
  async function sessionCookie(telegramId: number): Promise<Record<string, string>> {
    const openAuth = new AuthModule(new SqliteLoginTokenRepository(db.dataSource), {
      botUsername: { username: async () => 'DaftarBot' },
      access: telegramAccess([]),
    });
    const session = await openAuth.getOpenWebSessionUseCase().execute({ browserSecret: await confirmedLogin(telegramId) });
    if (!session.success) throw session.error;
    return { Cookie: `daftar_session=${session.data.sessionSecret}` };
  }

  const usersInDb = async () => (await db.dataSource.query('SELECT telegram_id FROM users')).map((row: { telegram_id: string }) => row.telegram_id);

  beforeEach(async () => {
    db = await openMigratedDatabase();
    userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
  });

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.close();
    jest.restoreAllMocks();
  });

  it('answers 403 to initData of someone not on the list, before the user is resolved', async () => {
    await serve([String(ALLOWED)]);

    const res = await get('/api/settings', { Authorization: `tma ${initData(STRANGER)}` });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 'ACCESS_NOT_ALLOWED' });
    expect(await usersInDb()).toEqual([]);
  });

  it('answers 403 to the session cookie of someone not on the list', async () => {
    await serve([String(ALLOWED)]);
    const cookie = await sessionCookie(STRANGER);

    const res = await get('/api/settings', cookie);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'ACCESS_NOT_ALLOWED' });
    expect(await usersInDb()).toEqual([]);
  });

  it('answers 403 to X-Dev-User-Id of someone not on the list, and to one that is no Telegram id', async () => {
    await serve([String(ALLOWED)]);

    expect((await get('/api/settings', { 'X-Dev-User-Id': String(STRANGER) })).status).toBe(403);
    expect((await get('/api/settings', { 'X-Dev-User-Id': 'abc' })).status).toBe(403);
    expect(await usersInDb()).toEqual([]);
  });

  it('does not turn a login confirmed while the list was open into a session for someone not on it', async () => {
    const browserSecret = await confirmedLogin(STRANGER);
    await serve([String(ALLOWED)]);

    const res = await call('POST', '/api/auth/session', { Cookie: `daftar_login=${browserSecret}` });

    expect(res.status).toBe(403);
    // The controllers' error envelope, not the middleware's
    expect(res.body.error).toMatchObject({ code: 'ACCESS_NOT_ALLOWED' });
    expect(res.setCookie).not.toContain('daftar_session=');
    expect(await usersInDb()).toEqual([]);
  });

  it('lets in the allowed by initData, session cookie and X-Dev-User-Id', async () => {
    await serve([String(ALLOWED)]);

    expect((await get('/api/settings', { Authorization: `tma ${initData(ALLOWED)}` })).status).toBe(200);
    expect((await get('/api/settings', await sessionCookie(ALLOWED))).status).toBe(200);
    expect((await get('/api/settings', { 'X-Dev-User-Id': String(ALLOWED) })).status).toBe(200);
    expect(await usersInDb()).toEqual([String(ALLOWED)]);
  });

  it('leaves a request that proves no user to its route', async () => {
    await serve([String(ALLOWED)]);

    expect((await get('/api/health')).status).toBe(200);
    expect((await get('/api/settings')).status).toBe(401);
    expect((await get('/api/settings', { Authorization: 'tma not-signed' })).status).toBe(401);
  });

  it('lets everyone in when the list is empty, as before', async () => {
    await serve([]);

    expect((await get('/api/settings', { Authorization: `tma ${initData(STRANGER)}` })).status).toBe(200);
    expect(await usersInDb()).toEqual([String(STRANGER)]);
  });
});

describe('the iPhone Shortcut captures only for an allowed owner (FT-153)', () => {
  let server: http.Server;
  let baseUrl: string;
  const savedToken = process.env.SHORTCUT_CAPTURE_TOKEN;

  beforeEach(async () => {
    jest.replaceProperty(AppConfig, 'TELEGRAM_ACCESS', telegramAccess([String(ALLOWED)]));
    delete process.env.SHORTCUT_CAPTURE_TOKEN;
    const app = express();
    app.use(express.json());
    app.post('/capture', allowShortcutCapture, (req, res) => {
      res.json({ userId: req.body.userId });
    });
    server = await new Promise<http.Server>(resolve => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (savedToken === undefined) delete process.env.SHORTCUT_CAPTURE_TOKEN;
    else process.env.SHORTCUT_CAPTURE_TOKEN = savedToken;
    jest.restoreAllMocks();
  });

  async function capture(headers: Record<string, string>) {
    const res = await fetch(`${baseUrl}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ text: 'кофе 25000' }),
    });
    return { status: res.status, body: await res.json() };
  }

  it('refuses an owner not on the list with 403', async () => {
    const res = await capture({ 'X-Shortcut-User-Id': String(STRANGER) });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'ACCESS_NOT_ALLOWED' });
  });

  it('captures for an owner on the list', async () => {
    const res = await capture({ 'X-Shortcut-User-Id': String(ALLOWED) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: String(ALLOWED) });
  });

  it('reads the owner as a number, as the list does: leading zeros name the same id (FT-155)', async () => {
    const res = await capture({ 'X-Shortcut-User-Id': `00${ALLOWED}` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: String(ALLOWED) });
  });

  it('checks the token first, so a wrong token does not tell who is on the list', async () => {
    process.env.SHORTCUT_CAPTURE_TOKEN = 'the-capture-token';
    const headers = { 'X-Shortcut-Capture-Token': 'wrong' };
    expect((await capture({ ...headers, 'X-Shortcut-User-Id': String(STRANGER) })).status).toBe(401);
    expect((await capture({ ...headers, 'X-Shortcut-User-Id': String(ALLOWED) })).status).toBe(401);
  });
});
