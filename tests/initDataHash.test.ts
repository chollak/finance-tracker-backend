import express from 'express';
import { requireAuth } from '../src/delivery/web/express/middleware/authMiddleware';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { captureLogLines, LogCapture } from './helpers/logLines';
import { signedInitData } from './helpers/telegramInitData';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * #275: initData whose hash is not 64 hex digits made `timingSafeEqual` throw on the length, and anyone's request was
 * written at `error` as «Error validating initData». Such a hash is refused before the comparison: 401 INVALID_AUTH and
 * a `warn`, as for a hash that does not match.
 */
const BOT_TOKEN = '123456:test-bot-token-for-the-initdata-hash';
const TELEGRAM_ID = 597843119;

const withHash = (hash: string) => {
  const params = new URLSearchParams(signedInitData(TELEGRAM_ID, BOT_TOKEN));
  params.set('hash', hash);
  return params.toString();
};

describe('initData with a malformed hash (#275)', () => {
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

  it.each([
    ['too short', 'abc'],
    ['too long', 'a'.repeat(65)],
    ['64 letters that are not hex', 'z'.repeat(64)],
    ['64 characters of two bytes each', 'ж'.repeat(64)],
    ['hex in capitals', 'A'.repeat(64)],
  ])('%s: 401 INVALID_AUTH and a warn, no error', async (_name, hash) => {
    const res = await signIn(withHash(hash));

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('INVALID_AUTH');
    const lines = await logs.lines();
    expect(lines.some(line => /warn/.test(line) && line.includes('Malformed hash in initData'))).toBe(true);
    expect(lines.filter(line => /error/.test(line))).toEqual([]);
  });

  it('a hash of the right form that does not match is a warn too; the real one signs in', async () => {
    const mismatch = await signIn(withHash('0'.repeat(64)));
    expect(mismatch.status).toBe(401);
    expect((await logs.lines()).some(line => line.includes('Hash mismatch - invalid initData'))).toBe(true);

    const signed = await signIn(signedInitData(TELEGRAM_ID, BOT_TOKEN));
    expect(signed.status).toBe(200);
    expect(await signed.json()).toEqual({ id: TELEGRAM_ID });
    expect((await logs.lines()).filter(line => /error/.test(line))).toEqual([]);
  });
});
