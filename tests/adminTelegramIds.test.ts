import express from 'express';
import { requireAdmin, requireAuth } from '../src/delivery/web/express/middleware/authMiddleware';
import { appConfigWith } from './helpers/appConfigWith';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * #255: ADMIN_TELEGRAM_IDS is read by the rule of ALLOWED_TELEGRAM_IDS (`telegramIdOf`). Before, its own `split` and a
 * comparison as written: `0131184740` on the list was not the admin `131184740`, and an entry that is no Telegram id
 * was skipped without a word. Now leading zeros name the same admin, and such an entry stops the start everywhere, as
 * it does in ALLOWED_TELEGRAM_IDS. `requireAdmin` reads the variable per request, as before.
 */

const ADMIN = 131184740;
const NOT_ADMIN = 131184741;

describe('ADMIN_TELEGRAM_IDS in AppConfig (#255)', () => {
  it('a list of Telegram ids, or none, lets the start go on', () => {
    expect(appConfigWith({ ADMIN_TELEGRAM_IDS: ` 0${ADMIN} , 597843119,, ` }).validate()).toEqual({ isValid: true, errors: [] });
    expect(appConfigWith({ ADMIN_TELEGRAM_IDS: '' }).validate()).toEqual({ isValid: true, errors: [] });
  });

  it('an entry that is not a Telegram id stops the start everywhere, naming the entry', () => {
    for (const NODE_ENV of ['development', 'production']) {
      const env = { NODE_ENV, ALLOWED_TELEGRAM_IDS: String(ADMIN), ADMIN_TELEGRAM_IDS: `${ADMIN}, @shukur, 12a` };
      const { isValid, errors } = appConfigWith(env).validate();
      expect(isValid).toBe(false);
      expect(errors).toEqual([expect.stringMatching(/^ADMIN_TELEGRAM_IDS .*@shukur, 12a/)]);
    }
  });
});

describe('requireAdmin (#255)', () => {
  let server: LoopbackServer;
  const savedAdmins = process.env.ADMIN_TELEGRAM_IDS;

  beforeAll(async () => {
    const app = express();
    app.get('/admin', requireAuth, requireAdmin, (_req, res) => {
      res.json({ ok: true });
    });
    server = await listenOnLoopback(app);
  });

  afterAll(() => server.close());

  afterEach(() => {
    if (savedAdmins === undefined) delete process.env.ADMIN_TELEGRAM_IDS;
    else process.env.ADMIN_TELEGRAM_IDS = savedAdmins;
  });

  /** The admin route signed in by X-Dev-User-Id from this machine, with these admins. */
  async function asUser(devUserId: number | string, admins: string): Promise<{ status: number; code?: string }> {
    process.env.ADMIN_TELEGRAM_IDS = admins;
    const res = await fetch(`${server.baseUrl}/admin`, { headers: { 'X-Dev-User-Id': String(devUserId) } });
    const body = await res.json();
    return res.status === 200 ? { status: 200 } : { status: res.status, code: body.code };
  }

  it('lets in an admin on the list, with spaces around the entry, as before', async () => {
    expect(await asUser(ADMIN, ` 597843119 , ${ADMIN} `)).toEqual({ status: 200 });
  });

  it('reads leading zeros on the list as the same admin', async () => {
    expect(await asUser(ADMIN, `0${ADMIN}`)).toEqual({ status: 200 });
    expect(await asUser(ADMIN, `000${ADMIN}`)).toEqual({ status: 200 });
  });

  it('refuses anyone not on the list, and everyone when the list is empty', async () => {
    expect(await asUser(NOT_ADMIN, String(ADMIN))).toEqual({ status: 403, code: 'ADMIN_REQUIRED' });
    expect(await asUser(ADMIN, '')).toEqual({ status: 403, code: 'ADMIN_REQUIRED' });
  });

  it('an entry that is no Telegram id names no admin: not the id it starts with', async () => {
    expect(await asUser(ADMIN, `${ADMIN}abc`)).toEqual({ status: 403, code: 'ADMIN_REQUIRED' });
    expect(await asUser(ADMIN, `${ADMIN}.0`)).toEqual({ status: 403, code: 'ADMIN_REQUIRED' });
  });

  it('X-Dev-User-Id that only starts with the admin\'s id is not the admin: `parseInt` made it one', async () => {
    expect(await asUser(`${ADMIN}abc`, String(ADMIN))).toEqual({ status: 401, code: 'INVALID_DEV_USER_ID' });
  });
});
