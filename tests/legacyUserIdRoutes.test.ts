import 'reflect-metadata';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { startTestServer, TestServer } from './helpers/testServer';
import { recordsOn } from './helpers/records';
import { resetSharedRateLimiters } from '../src/delivery/web/express/middleware/rateLimitMiddleware';
import { createSubscriptionRoutes } from '../src/delivery/web/express/routes/subscriptionRoutes';
import { createTransactionRouter } from '../src/modules/transaction/presentation/controllers/transactionController';
import { AnalyticsService } from '../src/modules/transaction/application/analyticsService';
import { GetUserTransactionsUseCase } from '../src/modules/transaction/application/getUserTransactions';
import { ArchiveAllByUserUseCase } from '../src/modules/transaction/application/archiveAllByUser';
import { GetArchivedTransactionsUseCase } from '../src/modules/transaction/application/getArchivedTransactions';
import { SubscriptionModule } from '../src/modules/subscription/subscriptionModule';
import { SubscriptionRepository } from '../src/modules/subscription/domain/subscriptionRepository';
import { CreateSubscriptionDTO, Subscription } from '../src/modules/subscription/domain/subscription';
import { SqliteUsageLimitRepository } from '../src/modules/subscription/infrastructure/SqliteUsageLimitRepository';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';

/**
 * FT-162: the legacy routes that still carry a userId — `:userId` in the path (transactions,
 * subscription status; the dashboard is gone since #205, budgets since #264, debts since #265) or `userId` in the body (subscription actions,
 * `POST /api/transactions`) — act only for the signed-in user, and refusing someone else's id touches nothing. Before, user resolution ran before the ownership
 * check and created a `users` row for any Telegram id it was given, and a userId that was not a string gave 500.
 *
 * Every request signs in through the local dev header as ME, over 127.0.0.1 (the shared test server).
 */

const ME = 131184740;
const MINE = String(ME);
const SOMEONE = '597843119';
/** An id of the old guest mode: there are no guests (decision Д4), and the backend's guest branches went in #206. */
const GUEST = 'guest_abc';
/** The id the admin grant made a `users` row of before #224. */
const GUEST_ZZZ = 'guest_zzz';
/** A UUID v4 no `users` row has: the admin grant gave it a subscription before #230. */
const NOBODY_UUID = 'a1b2c3d4-e5f6-4a1b-8c2d-1234567890ab';

/** Subscriptions: none until a trial starts; remembers whose active one was looked for and whose trial started. */
class NoSubscriptions implements SubscriptionRepository {
  readonly created: CreateSubscriptionDTO[] = [];
  readonly activeAskedFor: string[] = [];
  async findById(): Promise<null> { return null; }
  async findByUserId(): Promise<null> { return null; }
  async findActiveByUserId(userId: string): Promise<null> { this.activeAskedFor.push(userId); return null; }
  async create(dto: CreateSubscriptionDTO): Promise<Subscription> {
    this.created.push(dto);
    const now = new Date();
    return { id: `sub-${this.created.length}`, ...dto, status: 'active', startDate: now, endDate: now } as unknown as Subscription;
  }
  async update(): Promise<Subscription> { throw new Error('not stored'); }
  async findExpiring(): Promise<Subscription[]> { return []; }
  async findExpired(): Promise<Subscription[]> { return []; }
  async markAsExpired(): Promise<Subscription> { throw new Error('not stored'); }
}

const unused = {} as never;

let db: TestDatabase;
let server: TestServer;
let userTransactions: GetUserTransactionsUseCase;
let archivedTransactions: GetArchivedTransactionsUseCase;
let subscriptions: NoSubscriptions;
let records: ReturnType<typeof recordsOn>;

beforeAll(async () => {
  db = await openMigratedDatabase();
  records = recordsOn(db.dataSource);
  const users = new UserModule(new SqliteUserRepository(db.dataSource));
  subscriptions = new NoSubscriptions();

  const analytics = new AnalyticsService(records.repository);
  userTransactions = new GetUserTransactionsUseCase(records.repository);
  archivedTransactions = new GetArchivedTransactionsUseCase(records.repository);
  // The grant goes only to a user that exists (#230), wired as in createModules()
  const grantTargets = { exists: (userId: string) => users.exists(userId) };
  const subscriptionModule = new SubscriptionModule(subscriptions, new SqliteUsageLimitRepository(db.dataSource), grantTargets, {
    freeLimitsEnabled: false,
  });

  server = await startTestServer({
    '/transactions': createTransactionRouter(
      records.create, unused, analytics, userTransactions, unused, unused, unused,
      unused, unused, unused, unused, new ArchiveAllByUserUseCase(records.repository),
      archivedTransactions, subscriptionModule, users
    ),
    '/subscription': createSubscriptionRoutes(subscriptionModule, users),
  });
});

afterAll(async () => {
  await server.close();
  await db.close();
});

// Strict limits (10 or 5 per 15 minutes) guard the subscription actions; every case starts with empty counters
beforeEach(resetSharedRateLimiters);

// A row a refused request made would hide the next route's: each case starts with at most the own user
afterEach(async () => {
  await db.dataSource.query(`DELETE FROM users WHERE telegram_id <> ?`, [MINE]);
});

/** Telegram ids of the `users` rows. */
async function telegramIds(): Promise<string[]> {
  const rows: Array<{ telegram_id: string }> = await db.dataSource.query(`SELECT telegram_id FROM users ORDER BY telegram_id`);
  return rows.map(row => row.telegram_id);
}

async function myUuid(): Promise<string> {
  const [row]: Array<{ id: string }> = await db.dataSource.query(`SELECT id FROM users WHERE telegram_id = ?`, [MINE]);
  return row.id;
}

const call = (method: string, url: string, body?: unknown) => server.request(method, url, { devUser: ME, body });

interface LegacyRoute {
  method: 'GET' | 'POST';
  path: (userId: string) => string;
  /** What the route answers its own user, as before FT-162. */
  own: { status: number; code?: string };
  body?: Record<string, unknown>;
}

const OK = { status: 200 };

/** Every legacy route with `:userId` in the path. */
const PATH_ROUTES: LegacyRoute[] = [
  { method: 'GET', path: id => `/api/transactions/analytics/summary/${id}`, own: OK },
  { method: 'GET', path: id => `/api/transactions/analytics/categories/${id}`, own: OK },
  { method: 'GET', path: id => `/api/transactions/analytics/trends/${id}`, own: OK },
  { method: 'GET', path: id => `/api/transactions/analytics/patterns/${id}`, own: OK },
  { method: 'GET', path: id => `/api/transactions/analytics/top-categories/${id}`, own: OK },
  { method: 'GET', path: id => `/api/transactions/user/${id}`, own: OK },
  { method: 'POST', path: id => `/api/transactions/archive/all/${id}`, own: OK, body: {} },
  { method: 'GET', path: id => `/api/transactions/archived/user/${id}`, own: OK },
  { method: 'GET', path: id => `/api/subscription/${id}`, own: OK },
];

const named = PATH_ROUTES.map(route => [`${route.method} ${route.path(':userId')}`, route] as const);

describe('a legacy route with :userId in the path (FT-162)', () => {
  it.each(named)('%s: someone else’s id is 403 and adds no user', async (_name, route) => {
    const before = await telegramIds();

    for (const someone of [SOMEONE, `0${MINE}`, `${MINE}0`, GUEST]) {
      const res = await call(route.method, route.path(someone), route.body);
      expect({ someone, status: res.status, code: res.body?.code }).toEqual({ someone, status: 403, code: 'ACCESS_DENIED' });
    }

    expect(await telegramIds()).toEqual(before);
  });

  it.each(named)('%s: a blank id or a userId that is not one string is 400 and adds no user', async (_name, route) => {
    const before = await telegramIds();

    const blank = await call(route.method, route.path('%20'), route.body);
    // `?userId=a&userId=b` is an array
    const twice = await call(route.method, `${route.path(MINE)}?userId=${MINE}&userId=${MINE}`, route.body);
    const empty = await call(route.method, `${route.path(MINE)}?userId=`, route.body);

    for (const res of [blank, twice, empty]) {
      expect({ status: res.status, code: res.body?.code }).toEqual({ status: 400, code: 'INVALID_USER_ID' });
    }
    if (route.method === 'POST') {
      for (const userId of [ME, [MINE], '', null, { id: MINE }]) {
        const res = await call(route.method, route.path(MINE), { ...route.body, userId });
        expect({ userId, status: res.status, code: res.body?.code }).toEqual({ userId, status: 400, code: 'INVALID_USER_ID' });
      }
    }
    expect(await telegramIds()).toEqual(before);
  });

  it.each(named)('%s: a query or body naming someone else is 403 even with the own id in the path', async (_name, route) => {
    const before = await telegramIds();

    const query = await call(route.method, `${route.path(MINE)}?userId=${SOMEONE}`, route.body);
    expect({ status: query.status, code: query.body?.code }).toEqual({ status: 403, code: 'ACCESS_DENIED' });
    if (route.method === 'POST') {
      const body = await call(route.method, route.path(MINE), { ...route.body, userId: SOMEONE });
      expect({ status: body.status, code: body.body?.code }).toEqual({ status: 403, code: 'ACCESS_DENIED' });
    }
    expect(await telegramIds()).toEqual(before);
  });

  it.each(named)('%s: the own id answers as before', async (_name, route) => {
    const res = await call(route.method, route.path(MINE), route.body);

    expect({ status: res.status, code: res.body?.code }).toEqual({ status: route.own.status, code: route.own.code });
    expect(await telegramIds()).toEqual([MINE]);
  });

  it.each(named)('%s: a guest id without signing in is 401 and adds no user (#206)', async (_name, route) => {
    const before = await telegramIds();

    const res = await server.request(route.method, route.path(GUEST), { body: route.body });

    expect({ status: res.status, code: res.body?.code }).toEqual({ status: 401, code: 'MISSING_AUTH_HEADER' });
    expect(await telegramIds()).toEqual(before);
  });

  // Was asked of the budget routes until they went (#264); the records route keeps the same check
  it('GET /api/transactions/user/guest_abc without signing in reaches no record (#206)', async () => {
    const asked = jest.spyOn(userTransactions, 'execute');

    const res = await server.request('GET', `/api/transactions/user/${GUEST}`);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, code: 'MISSING_AUTH_HEADER' });
    expect(asked).not.toHaveBeenCalled();
    asked.mockRestore();
  });

  it('the own id reaches the use cases as the own user, not as the id in the path', async () => {
    const asked = jest.spyOn(userTransactions, 'execute');
    const archived = jest.spyOn(archivedTransactions, 'execute');
    await call('GET', `/api/transactions/user/${MINE}`);
    // The second route was the debts' summary until they went (#265)
    await call('GET', `/api/transactions/archived/user/${MINE}`);

    const uuid = await myUuid();
    expect(asked).toHaveBeenLastCalledWith(uuid);
    expect(archived.mock.calls.at(-1)?.[0]).toBe(uuid);
    asked.mockRestore();
    archived.mockRestore();
  });
});

describe('the subscription actions take the user from authentication (FT-162)', () => {
  const ACTIONS = [
    ['POST /api/subscription/check-limit', '/api/subscription/check-limit', { limitType: 'transactions' }],
    ['POST /api/subscription/start-trial', '/api/subscription/start-trial', {}],
    ['POST /api/subscription/cancel', '/api/subscription/cancel', { reason: 'test' }],
  ] as const;

  it('check-limit answers for the signed-in user without a userId in the body', async () => {
    const res = await call('POST', '/api/subscription/check-limit', { limitType: 'transactions' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ allowed: true });
    expect(await telegramIds()).toEqual([MINE]);
    expect(subscriptions.activeAskedFor.at(-1)).toBe(await myUuid());
  });

  it('start-trial starts the trial of the signed-in user without a userId in the body', async () => {
    const res = await call('POST', '/api/subscription/start-trial', {});

    expect(res.status).toBe(200);
    expect(subscriptions.created.at(-1)?.userId).toBe(await myUuid());
  });

  it('cancel acts for the signed-in user without a userId in the body', async () => {
    const res = await call('POST', '/api/subscription/cancel', { reason: 'test' });

    // Before FT-162 the user came from the body: without one, 400 «userId is required»
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ success: false, message: 'Активная подписка не найдена' });
    expect(subscriptions.activeAskedFor.at(-1)).toBe(await myUuid());
  });

  // The own Telegram id in the body or path is accepted, but the use case gets the user's UUID from authentication —
  // never the id the request carried
  it.each(ACTIONS)('%s: the own userId in the body reaches the use case as the own UUID', async (_name, url, body) => {
    const res = await call('POST', url, { ...body, userId: MINE });

    expect(res.status).toBe(200);
    const asked = url.endsWith('start-trial') ? subscriptions.created.at(-1)?.userId : subscriptions.activeAskedFor.at(-1);
    expect(asked).toBe(await myUuid());
  });

  it('GET /api/subscription/:userId with the own id reads the own UUID', async () => {
    const res = await call('GET', `/api/subscription/${MINE}`);

    expect(res.status).toBe(200);
    expect(subscriptions.activeAskedFor.at(-1)).toBe(await myUuid());
  });

  it.each(ACTIONS)('%s: a body or query naming someone else is 403 and adds no user', async (_name, url, body) => {
    const before = await telegramIds();

    for (const res of [await call('POST', url, { ...body, userId: SOMEONE }), await call('POST', `${url}?userId=${SOMEONE}`, body)]) {
      expect({ status: res.status, code: res.body?.code }).toEqual({ status: 403, code: 'ACCESS_DENIED' });
    }
    expect(await telegramIds()).toEqual(before);
  });

  it.each(ACTIONS)('%s: a userId that is not one non-blank string is 400', async (_name, url, body) => {
    const before = await telegramIds();

    for (const userId of [ME, [MINE], '', '  ', null]) {
      const res = await call('POST', url, { ...body, userId });
      expect({ userId, status: res.status, code: res.body?.code }).toEqual({ userId, status: 400, code: 'INVALID_USER_ID' });
    }
    const twice = await call('POST', `${url}?userId=${MINE}&userId=${MINE}`, body);
    expect({ status: twice.status, code: twice.body?.code }).toEqual({ status: 400, code: 'INVALID_USER_ID' });
    expect(await telegramIds()).toEqual(before);
  });

  /** Runs the requests as an admin: ADMIN_TELEGRAM_IDS is read on every request. */
  async function asAdmin(requests: () => Promise<void>): Promise<void> {
    const admins = process.env.ADMIN_TELEGRAM_IDS;
    process.env.ADMIN_TELEGRAM_IDS = MINE;
    try {
      await requests();
    } finally {
      process.env.ADMIN_TELEGRAM_IDS = admins;
    }
  }

  const grant = (userId: unknown) => call('POST', '/api/subscription/grant', { userId, grantedBy: 'test', durationDays: 30 });

  it('grant (admin) refuses a target userId that is not a string with 400, not 500', async () => {
    await asAdmin(async () => {
      for (const userId of [Number(SOMEONE), [SOMEONE]]) {
        const res = await grant(userId);
        expect({ userId, status: res.status, code: res.body?.code }).toEqual({ userId, status: 400, code: 'INVALID_USER_ID' });
      }
    });
  });

  // #224: before, `guest_zzz` became a `users` row with a premium subscription — any id that was no UUID was resolved as
  // a Telegram id. The admin limit is 5 requests per window, so five ids here
  it('grant (admin) refuses a target that is no UUID and no Telegram id with 400, adding no user and no subscription', async () => {
    const before = await telegramIds();
    const granted = subscriptions.created.length;

    await asAdmin(async () => {
      for (const userId of [GUEST_ZZZ, 'abc', '-5', '1.5', '0']) {
        const res = await grant(userId);
        expect({ userId, status: res.status, code: res.body?.code }).toEqual({ userId, status: 400, code: 'INVALID_USER_ID' });
      }
    });

    expect(await telegramIds()).toEqual(before);
    expect(subscriptions.created).toHaveLength(granted);
  });

  it('grant (admin) gives premium to a Telegram id, creating the user on first contact, and to a UUID, as before', async () => {
    const before = await telegramIds();

    await asAdmin(async () => {
      const byTelegramId = await grant(SOMEONE);
      expect(byTelegramId.status).toBe(200);
      const [someone]: Array<{ id: string }> = await db.dataSource.query(`SELECT id FROM users WHERE telegram_id = ?`, [SOMEONE]);
      expect(subscriptions.created.at(-1)?.userId).toBe(someone.id);

      const byUuid = await grant(someone.id);
      expect(byUuid.status).toBe(200);
      expect(subscriptions.created.at(-1)?.userId).toBe(someone.id);
    });

    expect(await telegramIds()).toEqual([...before, SOMEONE].sort());
  });

  // #230: one rule with ALLOWED_TELEGRAM_IDS — before, `0597843119` made a second user of the same person
  it('grant (admin) gives a Telegram id with leading zeros to the same user as without them', async () => {
    const before = await telegramIds();

    await asAdmin(async () => {
      expect((await grant(SOMEONE)).status).toBe(200);
      expect((await grant(`0${SOMEONE}`)).status).toBe(200);
    });

    const [someone]: Array<{ id: string }> = await db.dataSource.query(`SELECT id FROM users WHERE telegram_id = ?`, [SOMEONE]);
    expect(subscriptions.created.slice(-2).map(created => created.userId)).toEqual([someone.id, someone.id]);
    expect(await telegramIds()).toEqual([...before, SOMEONE].sort());
  });

  // #230: ids are stored in lower case and looked up exactly — an upper-case UUID of a user was 404
  it('grant (admin) to a user UUID in upper case gives premium to that user', async () => {
    await asAdmin(async () => {
      expect((await grant(SOMEONE)).status).toBe(200);
      const [someone]: Array<{ id: string }> = await db.dataSource.query(`SELECT id FROM users WHERE telegram_id = ?`, [SOMEONE]);

      const res = await grant(someone.id.toUpperCase());

      expect(res.status).toBe(200);
      expect(subscriptions.created.at(-1)?.userId).toBe(someone.id);
    });
  });

  // #230: past 2^53 a number is no Telegram id and no longer exact; 30 digits made a `users` row before
  it('grant (admin) refuses a number from 2^53 on with 400, adding no user and no subscription', async () => {
    const before = await telegramIds();
    const granted = subscriptions.created.length;

    await asAdmin(async () => {
      for (const userId of ['9007199254740993', '123456789012345678901234567890']) {
        const res = await grant(userId);
        expect({ userId, status: res.status, code: res.body?.code }).toEqual({ userId, status: 400, code: 'INVALID_USER_ID' });
      }
    });

    expect(await telegramIds()).toEqual(before);
    expect(subscriptions.created).toHaveLength(granted);
  });

  // #230: `subscriptions.user_id` has no foreign key — before, a UUID of no one got a premium subscription
  it('grant (admin) to a UUID no user has is 404, creating no subscription and expiring none', async () => {
    const granted = subscriptions.created.length;
    const looked = subscriptions.activeAskedFor.length;

    await asAdmin(async () => {
      const res = await grant(NOBODY_UUID);
      expect({ status: res.status, code: res.body?.error?.code }).toEqual({ status: 404, code: 'NOT_FOUND' });
    });

    expect(subscriptions.created).toHaveLength(granted);
    expect(subscriptions.activeAskedFor).toHaveLength(looked);
  });
});

describe('POST /api/transactions takes the user from authentication (FT-162)', () => {
  const RECORD = { type: 'expense', amount: 25000, category: 'Кафе', description: 'кофе', date: '2026-10-29' };

  async function ownersOf(description: string): Promise<string[]> {
    const rows: Array<{ userId: string }> = await db.dataSource.query(
      `SELECT userId FROM transactions WHERE description = ?`,
      [description]
    );
    return rows.map(row => row.userId);
  }

  it('writes for the signed-in user without a userId in the body', async () => {
    const res = await call('POST', '/api/transactions', { ...RECORD, description: 'без userId' });

    expect(res.status).toBe(201);
    expect(await ownersOf('без userId')).toEqual([await myUuid()]);
  });

  it('writes for the signed-in user when the body names them — the Mini App outbox sends it', async () => {
    const res = await call('POST', '/api/transactions', { ...RECORD, description: 'свой userId', userId: MINE });

    expect(res.status).toBe(201);
    expect(await ownersOf('свой userId')).toEqual([await myUuid()]);
  });

  it('refuses a body or query naming someone else with 403, writing nothing and adding no user', async () => {
    const before = await telegramIds();

    const body = await call('POST', '/api/transactions', { ...RECORD, description: 'чужой', userId: SOMEONE });
    const query = await call('POST', `/api/transactions?userId=${SOMEONE}`, { ...RECORD, description: 'чужой' });

    expect([body.status, query.status]).toEqual([403, 403]);
    expect(await ownersOf('чужой')).toEqual([]);
    expect(await telegramIds()).toEqual(before);
  });

  it('refuses a userId that is not one non-blank string with 400, writing nothing', async () => {
    for (const userId of [ME, [MINE], '', null]) {
      const res = await call('POST', '/api/transactions', { ...RECORD, description: 'не строка', userId });
      expect({ userId, status: res.status, code: res.body?.code }).toEqual({ userId, status: 400, code: 'INVALID_USER_ID' });
    }
    expect(await ownersOf('не строка')).toEqual([]);
  });
});
