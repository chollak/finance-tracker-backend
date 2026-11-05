import 'reflect-metadata';
import express from 'express';
import { buildServer } from '../src/delivery/web/express/expressServer';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * #274: `/api/users*` had no client — not the webapp, not the iOS app, not the bot. A user is made on the first
 * request (`createCurrentUserMiddleware`), settings change through `PATCH /api/settings`. `PUT /api/users/:id` wrote
 * `timezone` and `defaultCurrency` unchecked, and answered 404 before the owner check, telling whether a UUID was
 * someone's. The routes are gone; the time zone stays Tashkent's, the clock records and totals are counted on.
 */

/** Any module method buildServer calls gives an empty object: these tests go only to /api/users and /api/settings. */
const unusedModule = new Proxy({}, { get: () => () => ({}) }) as any;

const ME = '131184740';
/** A UUID v4 no `users` row has. */
const NOBODY_UUID = 'a1b2c3d4-e5f6-4a1b-8c2d-1234567890ab';

describe('the user routes are gone (#274)', () => {
  let db: TestDatabase;
  let server: LoopbackServer;
  let myId: string;

  beforeAll(async () => {
    db = await openMigratedDatabase();
    const userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
    myId = (await userModule.getGetOrCreateUserUseCase().execute({ telegramId: ME, firstName: 'Shukur' })).id;
    const app = express();
    app.use('/api', buildServer(unusedModule, userModule));
    server = await listenOnLoopback(app);
  });

  afterAll(async () => {
    await server.close();
    await db.close();
  });

  /** A request as the signed-in user sends it, so a route that is still there would answer it, not refuse it. */
  async function call(method: string, path: string, body?: unknown) {
    const res = await fetch(`${server.baseUrl}${path}`, {
      method,
      headers: { 'X-Dev-User-Id': ME, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  const myRow = async () =>
    (await db.dataSource.query('SELECT timezone, default_currency, user_name FROM users WHERE telegram_id = ?', [ME]))[0];

  it.each([
    ['GET', '/api/users/<my Telegram id>', () => `/api/users/${ME}`, undefined],
    ['POST', '/api/users', () => '/api/users', { telegramId: ME, firstName: 'Другое имя' }],
    ['PUT', '/api/users/<my UUID>', () => `/api/users/${myId}`, { timezone: 'Mars/Phobos', defaultCurrency: 'XYZ', userName: 'renamed' }],
    ['PUT', '/api/users/<no one’s UUID>', () => `/api/users/${NOBODY_UUID}`, { timezone: 'Europe/Moscow' }],
  ])('%s %s is not a route and changes nothing', async (method, _name, path, body) => {
    const res = await call(method, path(), body);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(await myRow()).toEqual({ timezone: 'Asia/Tashkent', default_currency: 'UZS', user_name: null });
    expect(await db.dataSource.query('SELECT COUNT(*) AS n FROM users')).toEqual([{ n: 1 }]);
  });

  it('the settings still change through PATCH /api/settings, and the time zone is not one of them', async () => {
    const refused = await call('PATCH', '/api/settings', { timezone: 'Europe/Moscow' });
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toContain('timezone is not a setting');
    expect((await myRow()).timezone).toBe('Asia/Tashkent');

    const changed = await call('PATCH', '/api/settings', { theme: 'dark' });
    expect(changed.status).toBe(200);
    expect(changed.body.data).toMatchObject({ userId: myId, theme: 'dark' });
    expect((await call('GET', '/api/settings')).body.data.theme).toBe('dark');
  });
});
