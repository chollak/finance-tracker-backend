import 'reflect-metadata';
import express from 'express';
import http from 'http';
import { AuthModule } from '../src/modules/auth/authModule';
import { SqliteLoginTokenRepository } from '../src/modules/auth/infrastructure/SqliteLoginTokenRepository';
import { createAuthRoutes } from '../src/modules/auth/presentation/authController';
import { deviceLabel, LOGIN_START_PREFIX, webLoginState } from '../src/modules/auth/domain/webLogin';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { createSettingsRoutes } from '../src/modules/user/presentation/controllers/settingsController';
import { createWebSessionMiddleware } from '../src/delivery/web/express/middleware/webSessionMiddleware';
import { signedInTelegramId } from '../src/delivery/web/express/middleware/authMiddleware';
import { errorHandler, notFoundHandler } from '../src/delivery/web/express/middleware/errorMiddleware';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { listenOnLoopback } from './helpers/testServer';

/**
 * FT-128: signing in to the web app through the bot (decision Д4). `POST /api/auth/web-login` gives a one-time link
 * `t.me/<bot>?start=login_<token>` that lives 5 minutes (`login_tokens`); the bot asks «Подтвердить» / «Это не я»;
 * the page asks how its login went, and a confirmed one becomes an httpOnly session cookie that the API takes as it
 * takes Telegram's initData. «Выйти» ends the session in this browser only.
 */

const TELEGRAM_ID = '597843119';
const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MINUTE = 60 * 1000;

describe('the device the bot names (FT-128)', () => {
  it('names the browser and the system as the board does: «Chrome · Windows»', () => {
    expect(deviceLabel(CHROME_WINDOWS)).toBe('Chrome · Windows');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'))
      .toBe('Safari · iPhone');
    expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'))
      .toBe('Safari · macOS');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'))
      .toBe('Edge · Windows');
    expect(deviceLabel('Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('Firefox · Linux');
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 YaBrowser/24.10 Mobile Safari/537.36'))
      .toBe('Яндекс Браузер · Android');
  });

  it('leaves out what it does not know', () => {
    expect(deviceLabel('curl/8.5.0')).toBe('Браузер');
    expect(deviceLabel(undefined)).toBe('Браузер');
  });
});

describe('web login through the bot (FT-128)', () => {
  let db: TestDatabase;
  let userModule: UserModule;
  let authModule: AuthModule;
  let now: Date;
  let botUsername: string | null;

  const later = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };

  /** The token of the bot link the browser got. */
  const tokenOf = (link: string) => new URL(link).searchParams.get('start')!.slice(LOGIN_START_PREFIX.length);

  async function start(userAgent = CHROME_WINDOWS) {
    const started = await authModule.getStartWebLoginUseCase().execute({ userAgent });
    if (!started.success) throw started.error;
    return started.data;
  }

  async function openInBot(token: string, telegramId = TELEGRAM_ID) {
    const opened = await authModule.getOpenLoginInBotUseCase().execute({ token, telegramId });
    if (!opened.success) throw opened.error;
    return opened.data;
  }

  async function answer(loginId: string, value: 'confirm' | 'reject', telegramId = TELEGRAM_ID) {
    const answered = await authModule.getAnswerLoginUseCase().execute({ loginId, telegramId, answer: value });
    if (!answered.success) throw answered.error;
    return answered.data;
  }

  async function statusOf(browserSecret: string) {
    const status = await authModule.getWebLoginStatusUseCase().execute({ browserSecret });
    if (!status.success) throw status.error;
    return status.data;
  }

  beforeEach(async () => {
    now = new Date('2026-10-14T14:42:00.000Z');
    botUsername = 'KapelkaBot';
    db = await openMigratedDatabase();
    userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
    authModule = new AuthModule(new SqliteLoginTokenRepository(db.dataSource), {
      botUsername: { username: async () => botUsername },
      now: () => now,
    });
  });

  afterEach(async () => {
    await db.close();
  });

  describe('the login', () => {
    it('gives a one-time link to the bot that lives 5 minutes, and a secret only the browser keeps', async () => {
      const first = await start();
      const second = await start();

      const link = new URL(first.link);
      expect(`${link.origin}${link.pathname}`).toBe('https://t.me/KapelkaBot');
      expect(link.searchParams.get('start')).toMatch(/^login_[A-Za-z0-9_-]{20,58}$/);
      // Telegram takes a start parameter of up to 64 characters
      expect(link.searchParams.get('start')!.length).toBeLessThanOrEqual(64);
      expect(first.expiresAt).toEqual(new Date('2026-10-14T14:47:00.000Z'));
      expect(first.browserSecret).not.toBe(tokenOf(first.link));
      // Every login has its own link and its own browser secret
      expect(tokenOf(second.link)).not.toBe(tokenOf(first.link));
      expect(second.browserSecret).not.toBe(first.browserSecret);

      expect(await statusOf(first.browserSecret)).toEqual({ status: 'pending', link: first.link, expiresAt: first.expiresAt });
    });

    it('keeps only hashes of the browser and session secrets', async () => {
      const { browserSecret } = await start();
      const rows = await db.dataSource.query('SELECT * FROM login_tokens');
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows)).not.toContain(browserSecret);
      expect(rows[0].device).toBe('Chrome · Windows');
      expect(rows[0].status).toBe('pending');
    });

    it('has no link to give when the bot username is unknown', async () => {
      botUsername = null;
      const started = await authModule.getStartWebLoginUseCase().execute({ userAgent: CHROME_WINDOWS });
      expect(started.success).toBe(false);
      if (!started.success) expect((started.error as { code?: string }).code).toBe('LOGIN_UNAVAILABLE');
    });

    it('a browser without a login has nothing to wait for', async () => {
      expect(await statusOf('no-such-secret')).toEqual({ status: 'none' });
      expect(await statusOf('')).toEqual({ status: 'none' });
    });
  });

  describe('the bot', () => {
    it('asks the one who opened the link, with the device and the time of the login', async () => {
      const { link } = await start();
      later(1000);
      const opened = await openInBot(tokenOf(link));
      expect(opened).toEqual({
        kind: 'ask',
        loginId: expect.any(String),
        device: 'Chrome · Windows',
        createdAt: new Date('2026-10-14T14:42:00.000Z'),
      });
      // Opening the link again asks again (a second /start), the same login
      expect(await openInBot(tokenOf(link))).toEqual(opened);
    });

    it('«Подтвердить» lets the waiting browser in; the browser takes the session once', async () => {
      const { link, browserSecret } = await start();
      const { loginId } = (await openInBot(tokenOf(link))) as { loginId: string };

      expect(await answer(loginId, 'confirm')).toEqual({ kind: 'confirmed', device: 'Chrome · Windows' });
      expect(await statusOf(browserSecret)).toEqual({ status: 'confirmed' });

      const session = await authModule.getOpenWebSessionUseCase().execute({ browserSecret });
      expect(session.success).toBe(true);
      if (!session.success) return;
      expect(session.data.telegramId).toBe(TELEGRAM_ID);
      expect(session.data.expiresAt).toEqual(new Date('2026-11-13T14:42:00.000Z'));

      const resolved = await authModule.getWebSessionUseCase().execute({ sessionSecret: session.data.sessionSecret });
      expect(resolved).toEqual({ success: true, data: { telegramId: TELEGRAM_ID } });

      // The same login cannot become a second session
      const again = await authModule.getOpenWebSessionUseCase().execute({ browserSecret });
      expect(again.success).toBe(false);
      if (!again.success) expect((again.error as { code?: string }).code).toBe('LOGIN_NOT_CONFIRMED');
      expect(await statusOf(browserSecret)).toEqual({ status: 'none' });
      // A second press of «Подтвердить» changes nothing
      expect(await answer(loginId, 'confirm')).toEqual({ kind: 'confirmed', device: 'Chrome · Windows' });
    });

    it('«Это не я» keeps the browser out', async () => {
      const { link, browserSecret } = await start();
      const { loginId } = (await openInBot(tokenOf(link))) as { loginId: string };

      expect(await answer(loginId, 'reject')).toEqual({ kind: 'rejected', device: 'Chrome · Windows' });
      expect(await statusOf(browserSecret)).toEqual({ status: 'rejected' });
      const session = await authModule.getOpenWebSessionUseCase().execute({ browserSecret });
      expect(session.success).toBe(false);
      // The answer stands: «Подтвердить» from an older message does not turn it
      expect(await answer(loginId, 'confirm')).toEqual({ kind: 'rejected', device: 'Chrome · Windows' });
    });

    it('after 5 minutes the link is out of date: the bot says so and the page shows «Вход не подтвердили»', async () => {
      const { link, browserSecret } = await start();
      const { loginId } = (await openInBot(tokenOf(link))) as { loginId: string };

      later(5 * MINUTE);
      expect(await statusOf(browserSecret)).toEqual({ status: 'expired' });
      expect(await answer(loginId, 'confirm')).toEqual({ kind: 'expired', device: 'Chrome · Windows' });
      expect(await statusOf(browserSecret)).toEqual({ status: 'expired' });
      expect(await openInBot(tokenOf(link))).toEqual({ kind: 'stale' });
    });

    it('a confirmed login waits for its browser the same 5 minutes', async () => {
      const { link, browserSecret } = await start();
      const { loginId } = (await openInBot(tokenOf(link))) as { loginId: string };
      later(4 * MINUTE);
      await answer(loginId, 'confirm');

      later(4 * MINUTE);
      expect(await statusOf(browserSecret)).toEqual({ status: 'confirmed' });
      later(1 * MINUTE);
      expect(await statusOf(browserSecret)).toEqual({ status: 'expired' });
      const session = await authModule.getOpenWebSessionUseCase().execute({ browserSecret });
      expect(session.success).toBe(false);
    });

    it('only the one who opened the link answers it; another account sees an out-of-date link', async () => {
      const { link, browserSecret } = await start();
      const { loginId } = (await openInBot(tokenOf(link))) as { loginId: string };

      expect(await openInBot(tokenOf(link), '111')).toEqual({ kind: 'stale' });
      expect(await answer(loginId, 'confirm', '111')).toEqual({ kind: 'stale' });
      expect((await statusOf(browserSecret)).status).toBe('pending');
    });

    it('a link that does not exist, or was cancelled in the browser, is out of date', async () => {
      expect(await openInBot('no-such-token')).toEqual({ kind: 'stale' });
      expect(await answer('00000000-0000-0000-0000-000000000000', 'confirm')).toEqual({ kind: 'stale' });

      const { link, browserSecret } = await start();
      const { loginId } = (await openInBot(tokenOf(link))) as { loginId: string };
      const cancelled = await authModule.getCancelWebLoginUseCase().execute({ browserSecret });
      expect(cancelled.success).toBe(true);
      expect(await statusOf(browserSecret)).toEqual({ status: 'none' });
      expect(await answer(loginId, 'confirm')).toEqual({ kind: 'stale' });
      expect(await openInBot(tokenOf(link))).toEqual({ kind: 'stale' });
    });
  });

  describe('the session', () => {
    async function signedIn(): Promise<string> {
      const { link, browserSecret } = await start();
      const { loginId } = (await openInBot(tokenOf(link))) as { loginId: string };
      await answer(loginId, 'confirm');
      const session = await authModule.getOpenWebSessionUseCase().execute({ browserSecret });
      if (!session.success) throw session.error;
      return session.data.sessionSecret;
    }

    it('lasts 30 days', async () => {
      const sessionSecret = await signedIn();
      later(30 * 24 * 60 * MINUTE - 1000);
      expect((await authModule.getWebSessionUseCase().execute({ sessionSecret }))).toEqual({ success: true, data: { telegramId: TELEGRAM_ID } });
      later(1000);
      expect((await authModule.getWebSessionUseCase().execute({ sessionSecret }))).toEqual({ success: true, data: null });
    });

    it('«Выйти» ends it in this browser only', async () => {
      const here = await signedIn();
      const elsewhere = await signedIn();

      const closed = await authModule.getCloseWebSessionUseCase().execute({ sessionSecret: here });
      expect(closed.success).toBe(true);
      expect(await authModule.getWebSessionUseCase().execute({ sessionSecret: here })).toEqual({ success: true, data: null });
      expect(await authModule.getWebSessionUseCase().execute({ sessionSecret: elsewhere })).toEqual({ success: true, data: { telegramId: TELEGRAM_ID } });
    });

    it('an unknown cookie is no session', async () => {
      expect(await authModule.getWebSessionUseCase().execute({ sessionSecret: 'nope' })).toEqual({ success: true, data: null });
    });
  });

  describe('old rows', () => {
    const DAY = 24 * 60 * MINUTE;
    const rows = async () => (await db.dataSource.query('SELECT device, status FROM login_tokens ORDER BY created_at, rowid')) as Array<{ device: string; status: string }>;

    async function signedIn(userAgent: string) {
      const { link, browserSecret } = await start(userAgent);
      const { loginId } = (await openInBot(tokenOf(link))) as { loginId: string };
      await answer(loginId, 'confirm');
      const session = await authModule.getOpenWebSessionUseCase().execute({ browserSecret });
      if (!session.success) throw session.error;
      return session.data.sessionSecret;
    }

    it('a new login clears logins whose link, and session if any, ended more than 7 days ago', async () => {
      // Device labels tell the rows apart
      await start('curl/1 Firefox/1');
      const rejected = await start('Chrome/1 (iPhone)');
      const { loginId } = (await openInBot(tokenOf(rejected.link))) as { loginId: string };
      await answer(loginId, 'reject');
      await signedIn('Chrome/1 (Windows)');
      const signedOut = await signedIn('Chrome/1 (Linux)');
      await authModule.getCloseWebSessionUseCase().execute({ sessionSecret: signedOut });

      // 7 days after the links ended, less a minute: everything stays (and the new one)
      later(7 * DAY + 4 * MINUTE);
      await start('Chrome/1 (Android)');
      expect(await rows()).toHaveLength(5);

      // Past the 7 days: the unanswered and the rejected login go; the sessions stay — their 30 days are not over
      later(2 * MINUTE);
      await start('Chrome/1 (iPad)');
      expect(await rows()).toEqual([
        { device: 'Chrome · Windows', status: 'active' },
        { device: 'Chrome · Linux', status: 'signed_out' },
        { device: 'Chrome · Android', status: 'pending' },
        { device: 'Chrome · iPad', status: 'pending' },
      ]);

      // 7 days after the sessions' 30: they go too, and so do the links of a week ago
      later(30 * DAY);
      await start('Chrome/1 (Mac OS X)');
      expect(await rows()).toEqual([{ device: 'Chrome · macOS', status: 'pending' }]);
    });

    it('a live session is never cleared, whatever its age', async () => {
      const sessionSecret = await signedIn(CHROME_WINDOWS);
      later(30 * DAY - MINUTE);
      await start();
      expect(await authModule.getWebSessionUseCase().execute({ sessionSecret })).toEqual({ success: true, data: { telegramId: TELEGRAM_ID } });
    });
  });

  describe('state rules', () => {
    it('a login that became a session, or was cancelled, has nothing for the waiting page', () => {
      const base = {
        id: 'l', token: 't', browserHash: 'b', sessionHash: null, device: 'Chrome', telegramId: TELEGRAM_ID,
        createdAt: now, expiresAt: new Date(now.getTime() + 5 * MINUTE), confirmedAt: null, sessionExpiresAt: null,
      };
      expect(webLoginState({ ...base, status: 'active' }, now)).toBe('none');
      expect(webLoginState({ ...base, status: 'cancelled' }, now)).toBe('none');
      expect(webLoginState({ ...base, status: 'signed_out' }, now)).toBe('none');
      expect(webLoginState(null, now)).toBe('none');
    });
  });

  describe('routes', () => {
    let server: http.Server;
    let baseUrl: string;

    /** A browser: keeps the cookies the server sets, sends them back, and never reads them itself. */
    class Browser {
      cookies = new Map<string, string>();
      setCookies: string[] = [];

      async request(method: string, url: string, headers: Record<string, string> = {}) {
        const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
        const res = await fetch(`${baseUrl}${url}`, {
          method,
          headers: { 'User-Agent': CHROME_WINDOWS, ...(cookie ? { Cookie: cookie } : {}), ...headers },
        });
        this.setCookies = res.headers.getSetCookie();
        for (const line of this.setCookies) {
          const [pair, ...attributes] = line.split(';').map(part => part.trim());
          const [name, value] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)];
          const gone = !value || attributes.some(attribute => /^expires=Thu, 01 Jan 1970/i.test(attribute) || /^max-age=0$/i.test(attribute));
          if (gone) this.cookies.delete(name);
          else this.cookies.set(name, value);
        }
        const text = await res.text();
        return { status: res.status, body: text ? JSON.parse(text) : null };
      }
    }

    beforeEach(async () => {
      const app = express();
      app.use(express.json());
      app.use('/api', createWebSessionMiddleware(sessionSecret => authModule.getWebSessionUseCase().execute({ sessionSecret })));
      app.use('/api/auth', createAuthRoutes(authModule, userModule));
      app.use('/api/settings', createSettingsRoutes(userModule));
      app.get('/api/who', (req, res) => {
        res.json({ telegramId: signedInTelegramId(req, 'bot-token') });
      });
      app.use('*', notFoundHandler);
      app.use(errorHandler);
      // The strict limiter allows 10 logins per 15 minutes: the test server starts it with empty counters
      ({ server, baseUrl } = await listenOnLoopback(app));
      // The bot created the user when it saw /start
      await userModule.getGetOrCreateUserUseCase().execute({ telegramId: TELEGRAM_ID, firstName: 'Шукур', userName: 'shukur' });
    });

    afterEach(async () => {
      await new Promise<void>(resolve => server.close(() => resolve()));
    });

    it('signs a browser in through the bot, and the API takes the session as it takes initData', async () => {
      const browser = new Browser();
      expect((await browser.request('GET', '/api/settings')).status).toBe(401);
      expect((await browser.request('GET', '/api/auth/session')).status).toBe(401);

      const started = await browser.request('POST', '/api/auth/web-login');
      expect(started.status).toBe(201);
      expect(started.body.data).toEqual({ status: 'pending', link: expect.stringMatching(/^https:\/\/t\.me\/KapelkaBot\?start=login_/), expiresAt: '2026-10-14T14:47:00.000Z' });
      // The waiting secret is an httpOnly cookie for the login routes only, never in the body
      const loginCookie = browser.setCookies.find(line => line.startsWith('daftar_login='))!;
      expect(loginCookie).toMatch(/HttpOnly/i);
      expect(loginCookie).toMatch(/SameSite=Lax/i);
      expect(loginCookie).toMatch(/Path=\/api\/auth/);
      expect(JSON.stringify(started.body)).not.toContain(browser.cookies.get('daftar_login'));

      const waiting = await browser.request('GET', '/api/auth/web-login');
      expect(waiting.body.data).toEqual(started.body.data);

      const { loginId } = (await openInBot(tokenOf(started.body.data.link))) as { loginId: string };
      // Not confirmed yet: no session
      expect((await browser.request('POST', '/api/auth/session')).status).toBe(409);
      await answer(loginId, 'confirm');

      expect((await browser.request('GET', '/api/auth/web-login')).body.data).toEqual({ status: 'confirmed' });
      const opened = await browser.request('POST', '/api/auth/session');
      expect(opened.status).toBe(201);
      expect(opened.body.data).toEqual({ user: { telegramId: TELEGRAM_ID, firstName: 'Шукур', username: 'shukur' } });
      const sessionCookie = browser.setCookies.find(line => line.startsWith('daftar_session='))!;
      expect(sessionCookie).toMatch(/HttpOnly/i);
      expect(sessionCookie).toMatch(/SameSite=Lax/i);
      expect(sessionCookie).toMatch(/Path=\/api/);
      expect(sessionCookie).toMatch(/Max-Age=2592000/i);
      // The waiting cookie is done
      expect(browser.cookies.has('daftar_login')).toBe(false);

      expect((await browser.request('GET', '/api/auth/session')).body.data).toEqual({ user: { telegramId: TELEGRAM_ID, firstName: 'Шукур', username: 'shukur' } });
      const settings = await browser.request('GET', '/api/settings');
      expect(settings.status).toBe(200);
      // The general rate limit counts the session's user, not the address (FT-139)
      expect((await browser.request('GET', '/api/who')).body).toEqual({ telegramId: Number(TELEGRAM_ID) });

      // «Выйти»: this browser is out
      const out = await browser.request('DELETE', '/api/auth/session');
      expect(out.status).toBe(200);
      expect(browser.cookies.has('daftar_session')).toBe(false);
      expect((await browser.request('GET', '/api/settings')).status).toBe(401);
    });

    it('a session cookie that was signed out lets nobody in, even if it is sent again', async () => {
      const browser = new Browser();
      const started = await browser.request('POST', '/api/auth/web-login');
      const { loginId } = (await openInBot(tokenOf(started.body.data.link))) as { loginId: string };
      await answer(loginId, 'confirm');
      await browser.request('POST', '/api/auth/session');
      const stolen = browser.cookies.get('daftar_session')!;

      await browser.request('DELETE', '/api/auth/session');
      const replay = new Browser();
      replay.cookies.set('daftar_session', stolen);
      expect((await replay.request('GET', '/api/settings')).status).toBe(401);
      expect((await replay.request('GET', '/api/who')).body).toEqual({ telegramId: null });
    });

    it('another browser cannot take a login it did not start', async () => {
      const mine = new Browser();
      const started = await mine.request('POST', '/api/auth/web-login');
      const { loginId } = (await openInBot(tokenOf(started.body.data.link))) as { loginId: string };
      await answer(loginId, 'confirm');

      const other = new Browser();
      expect((await other.request('GET', '/api/auth/web-login')).body.data).toEqual({ status: 'none' });
      expect((await other.request('POST', '/api/auth/session')).status).toBe(409);
      expect(other.cookies.has('daftar_session')).toBe(false);
    });

    it('«Отменить вход» forgets the login in this browser', async () => {
      const browser = new Browser();
      await browser.request('POST', '/api/auth/web-login');
      const cancelled = await browser.request('DELETE', '/api/auth/web-login');
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data).toEqual({ status: 'none' });
      expect(browser.cookies.has('daftar_login')).toBe(false);
      expect((await browser.request('GET', '/api/auth/web-login')).body.data).toEqual({ status: 'none' });
    });

    it('«Это не я» is told to the page once: the waiting cookie goes with that answer, so a reload starts clean', async () => {
      const browser = new Browser();
      const started = await browser.request('POST', '/api/auth/web-login');
      const { loginId } = (await openInBot(tokenOf(started.body.data.link))) as { loginId: string };
      await answer(loginId, 'reject');

      const told = await browser.request('GET', '/api/auth/web-login');
      expect(told.body.data).toEqual({ status: 'rejected' });
      expect(browser.setCookies.some(line => line.startsWith('daftar_login=') && /Path=\/api\/auth/.test(line))).toBe(true);
      expect(browser.cookies.has('daftar_login')).toBe(false);

      // A reload within the cookie's 10 minutes: nothing to say again
      expect((await browser.request('GET', '/api/auth/web-login')).body.data).toEqual({ status: 'none' });
    });

    it('keeps the waiting cookie while there is still something to wait for or to say', async () => {
      const browser = new Browser();
      await browser.request('POST', '/api/auth/web-login');
      await browser.request('GET', '/api/auth/web-login');
      expect(browser.cookies.has('daftar_login')).toBe(true);

      later(5 * MINUTE);
      expect((await browser.request('GET', '/api/auth/web-login')).body.data).toEqual({ status: 'expired' });
      // «Вход не подтвердили» shows again after a reload, as the board's screen does
      expect(browser.cookies.has('daftar_login')).toBe(true);
    });

    it('says the time is out after 5 minutes', async () => {
      const browser = new Browser();
      await browser.request('POST', '/api/auth/web-login');
      later(5 * MINUTE);
      expect((await browser.request('GET', '/api/auth/web-login')).body.data).toEqual({ status: 'expired' });
    });

    it('answers 503 when there is no bot to sign in through', async () => {
      botUsername = null;
      const browser = new Browser();
      const started = await browser.request('POST', '/api/auth/web-login');
      expect(started.status).toBe(503);
      expect(started.body.error.code).toBe('LOGIN_UNAVAILABLE');
      expect(browser.cookies.has('daftar_login')).toBe(false);
    });

    it('a Telegram Mini App request keeps its own sign-in: the Authorization header goes first', async () => {
      const browser = new Browser();
      // Outside production the Mini App in dev signs in with X-Dev-User-Id; a session cookie does not override it
      const res = await browser.request('GET', '/api/who', { 'X-Dev-User-Id': '42' });
      expect(res.body).toEqual({ telegramId: 42 });
    });
  });
});
