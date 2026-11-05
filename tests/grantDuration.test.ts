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
 * #256 (beyond its DoD): `durationDays` of the admin grant `POST /api/subscription/grant` is a whole number of days
 * from 1 to 3650. Before, any value went into the date: `0` became 30 days, `-5` a subscription expired at birth,
 * `"abc"` an invalid date. Now anything else is `400 VALIDATION_ERROR` before the target is resolved, so a refused grant
 * adds no subscription and no user. Without `durationDays` the gift is 30 days, as before. Real SQLite, real routes.
 */

const ADMIN = 131256000;
const TARGET = '131256001';
const DAY_MS = 24 * 60 * 60 * 1000;

let db: TestDatabase;
let server: TestServer;
let admins: string | undefined;

beforeEach(async () => {
  db = await openMigratedDatabase();
  const users = new UserModule(new SqliteUserRepository(db.dataSource));
  const subscriptionModule = new SubscriptionModule(
    new SqliteSubscriptionRepository(db.dataSource),
    new SqliteUsageLimitRepository(db.dataSource),
    { exists: (userId: string) => users.exists(userId) },
    { freeLimitsEnabled: false }
  );
  server = await startTestServer({ '/subscription': createSubscriptionRoutes(subscriptionModule, users) });
  admins = process.env.ADMIN_TELEGRAM_IDS;
  process.env.ADMIN_TELEGRAM_IDS = String(ADMIN);
});

afterEach(async () => {
  process.env.ADMIN_TELEGRAM_IDS = admins;
  await server.close();
  await db.close();
});

/** One grant as the admin; the admin limit is 5 requests a window, so each starts with empty counters. */
async function grant(body: Record<string, unknown>): Promise<{ status: number; body: any }> {
  await resetSharedRateLimiters();
  return server.request('POST', '/api/subscription/grant', { devUser: ADMIN, body: { userId: TARGET, grantedBy: 'admin', ...body } });
}

const count = async (sql: string, params: unknown[] = []) => Number((await db.dataSource.query(sql, params))[0].n);

/** Days between the start and the end of the subscription the grant answered with. */
function daysOf(response: { body: any }): number {
  const { startDate, endDate } = response.body.data.subscription;
  return (new Date(endDate).getTime() - new Date(startDate).getTime()) / DAY_MS;
}

describe('durationDays of the admin grant (#256)', () => {
  it.each([
    ['zero', 0],
    ['negative', -5],
    ['a fraction', 1.5],
    ['a number in a string', '30'],
    ['a word', 'abc'],
    ['over ten years', 3651],
    ['a boolean', true],
    ['an array', [7]],
    ['an object', {}],
  ])('refuses %s with 400 VALIDATION_ERROR, adding no subscription and no user', async (_name, durationDays) => {
    const response = await grant({ durationDays });

    expect({ status: response.status, code: response.body?.error?.code }).toEqual({ status: 400, code: 'VALIDATION_ERROR' });
    expect(await count(`SELECT COUNT(*) AS n FROM subscriptions`)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS n FROM users WHERE telegram_id = ?`, [TARGET])).toBe(0);
  });

  it('refuses a bad value for a lifetime grant too: the body is wrong either way', async () => {
    const response = await grant({ isLifetime: true, durationDays: 0 });

    expect({ status: response.status, code: response.body?.error?.code }).toEqual({ status: 400, code: 'VALIDATION_ERROR' });
    expect(await count(`SELECT COUNT(*) AS n FROM subscriptions`)).toBe(0);
  });

  it.each([1, 3650])('gives a gift of %i days', async (durationDays) => {
    const response = await grant({ durationDays });

    expect(response.status).toBe(200);
    expect(daysOf(response)).toBe(durationDays);
  });

  it.each([
    ['without durationDays', {}],
    ['with durationDays null', { durationDays: null }],
  ])('gives a gift of 30 days %s, as before', async (_name, body) => {
    const response = await grant(body);

    expect(response.status).toBe(200);
    expect(daysOf(response)).toBe(30);
    expect(response.body.data.subscription.priceStars).toBe(0);
  });
});
