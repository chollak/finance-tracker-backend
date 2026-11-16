import express from 'express';
import { INIT_DATA_MAX_AGE_SECONDS, requireAuth, signedInTelegramId } from '../src/delivery/web/express/middleware/authMiddleware';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { captureLogLines, levelOf, LogCapture } from './helpers/logLines';
import { signedInitData } from './helpers/telegramInitData';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * #316 (decision 2026-11-16): Telegram gives a Mini App its initData once, when it is opened, and does not renew it
 * while the Mini App stays open or minimised. It lived an hour, so a Mini App left open longer got 401 on every
 * request. It lives 24 hours now — one constant. Older initData with a valid signature is refused with its own code,
 * `INIT_DATA_EXPIRED`; a forged one stays `INVALID_AUTH`, and an expired forgery is a forgery.
 */
const BOT_TOKEN = '123456:test-bot-token-for-the-initdata-age';
const TELEGRAM_ID = 597843119;
const HOUR = 3600;
const MINUTE = 60;

describe('how long initData signs in (#316)', () => {
  let server: LoopbackServer;
  let logs: LogCapture;

  beforeEach(async () => {
    jest.replaceProperty(AppConfig, 'TG_BOT_API_KEY', BOT_TOKEN);
    const app = express();
    app.get('/me', requireAuth, (req, res) => {
      res.json({ id: req.telegramUser?.id ?? null });
    });
    server = await listenOnLoopback(app);
    logs = captureLogLines();
  });

  afterEach(async () => {
    logs.restore();
    await server.close();
    jest.restoreAllMocks();
  });

  const signIn = (initData: string) => fetch(`${server.baseUrl}/me`, { headers: { Authorization: `tma ${initData}` } });

  it('is 24 hours', () => {
    expect(INIT_DATA_MAX_AGE_SECONDS).toBe(24 * HOUR);
  });

  it.each([
    ['given out just now', 0],
    ['two hours ago — refused before #316', 2 * HOUR],
    ['a minute before the 24 hours run out', 24 * HOUR - MINUTE],
  ])('initData %s signs in', async (_name, age) => {
    const res = await signIn(signedInitData(TELEGRAM_ID, BOT_TOKEN, age));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: TELEGRAM_ID });
  });

  it.each([
    ['a minute after the 24 hours', 24 * HOUR + MINUTE],
    ['two days old', 48 * HOUR],
  ])('initData %s: 401 INIT_DATA_EXPIRED and a warn', async (_name, age) => {
    const res = await signIn(signedInitData(TELEGRAM_ID, BOT_TOKEN, age));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: 'Telegram sign-in expired, open the Mini App again', code: 'INIT_DATA_EXPIRED' });
    const lines = await logs.lines();
    expect(lines.some(line => levelOf(line) === 'warn' && line.includes('initData expired'))).toBe(true);
    expect(lines.filter(line => levelOf(line) === 'error')).toEqual([]);
  });

  it('a forged signature stays INVALID_AUTH, also when it is old: the age of a forgery is not news', async () => {
    const forged = new URLSearchParams(signedInitData(TELEGRAM_ID, BOT_TOKEN, 48 * HOUR));
    forged.set('hash', '0'.repeat(64));

    const res = await signIn(forged.toString());

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('INVALID_AUTH');
  });

  it('signed by another bot token: INVALID_AUTH, not expired', async () => {
    const res = await signIn(signedInitData(TELEGRAM_ID, '654321:another-bot', 2 * HOUR));

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('INVALID_AUTH');
  });
});

describe('who an initData request is, for the rate limit and closed access', () => {
  const requestWith = (initData: string) =>
    ({ headers: { authorization: `tma ${initData}` }, socket: { remoteAddress: '203.0.113.5' } }) as unknown as express.Request;

  it('within 24 hours — its user', () => {
    expect(signedInTelegramId(requestWith(signedInitData(TELEGRAM_ID, BOT_TOKEN, 23 * HOUR)), BOT_TOKEN)).toBe(TELEGRAM_ID);
  });

  it('older — nobody, as without a sign-in', () => {
    expect(signedInTelegramId(requestWith(signedInitData(TELEGRAM_ID, BOT_TOKEN, 25 * HOUR)), BOT_TOKEN)).toBeNull();
  });
});
