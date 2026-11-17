import 'reflect-metadata';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { startTestServer, TestServer } from './helpers/testServer';
import { resetSharedRateLimiters } from '../src/delivery/web/express/middleware/rateLimitMiddleware';
import { createSubscriptionRoutes } from '../src/delivery/web/express/routes/subscriptionRoutes';
import { SubscriptionModule } from '../src/modules/subscription/subscriptionModule';
import { SqliteSubscriptionRepository } from '../src/modules/subscription/infrastructure/SqliteSubscriptionRepository';
import { SqliteUsageLimitRepository } from '../src/modules/subscription/infrastructure/SqliteUsageLimitRepository';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';

/**
 * #320 (decision 2026-11-17): `POST /api/subscription/check-limit`, `/cancel` and `/start-trial` are gone. Neither the
 * Mini App, nor the iOS app, nor the bot called them: the bot checks limits and cancels through the use cases, and
 * nothing started a trial. Reading the status (`GET /api/subscription/:userId`) and the admin grant stay. The rules of
 * the subscription and of the limits are as they were. Real SQLite, real routes.
 */

const ME = 131320000;

let db: TestDatabase;
let server: TestServer;

beforeAll(async () => {
  db = await openMigratedDatabase();
  const users = new UserModule(new SqliteUserRepository(db.dataSource));
  const subscriptionModule = new SubscriptionModule(
    new SqliteSubscriptionRepository(db.dataSource),
    new SqliteUsageLimitRepository(db.dataSource),
    { exists: (userId: string) => users.exists(userId) },
    { freeLimitsEnabled: false }
  );
  server = await startTestServer({ '/subscription': createSubscriptionRoutes(subscriptionModule, users) });
});

afterAll(async () => {
  await server.close();
  await db.close();
});

beforeEach(resetSharedRateLimiters);

const count = async (table: string) => Number((await db.dataSource.query(`SELECT COUNT(*) AS n FROM ${table}`))[0].n);

describe('the subscription actions no one called are gone (#320)', () => {
  // Before: 401 without a session; with one, the use case ran — start-trial gave 14 days of premium
  it.each([
    ['/api/subscription/check-limit', { limitType: 'transactions' }],
    ['/api/subscription/cancel', { reason: 'test' }],
    ['/api/subscription/start-trial', {}],
  ])('POST %s is not a route, signed in or not, and touches nothing', async (path, body) => {
    for (const devUser of [undefined, ME]) {
      const res = await server.request('POST', path, { devUser, body });

      expect({ devUser, status: res.status, code: res.body?.code }).toEqual({ devUser, status: 404, code: 'NOT_FOUND' });
    }
    expect([await count('users'), await count('subscriptions')]).toEqual([0, 0]);
  });

  it('GET /api/subscription/:userId still reads the signed-in user’s status', async () => {
    const res = await server.request('GET', `/api/subscription/${ME}`, { devUser: ME });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ subscription: null, isPremium: false, isTrialActive: false });
  });
});
