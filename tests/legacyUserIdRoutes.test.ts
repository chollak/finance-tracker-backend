import 'reflect-metadata';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { startTestServer, TestServer } from './helpers/testServer';
import { recordsOn } from './helpers/records';
import { resetSharedRateLimiters } from '../src/delivery/web/express/middleware/rateLimitMiddleware';
import { createSubscriptionRoutes } from '../src/delivery/web/express/routes/subscriptionRoutes';
import { createDashboardRouter } from '../src/delivery/web/express/routes/dashboardRoutes';
import { createBudgetRouter } from '../src/modules/budget/interfaces/budgetRoutes';
import { createDebtRouter } from '../src/modules/debt/presentation/controllers/debtRoutes';
import { createTransactionRouter } from '../src/modules/transaction/presentation/controllers/transactionController';
import { AnalyticsService } from '../src/modules/transaction/application/analyticsService';
import { GetUserTransactionsUseCase } from '../src/modules/transaction/application/getUserTransactions';
import { ArchiveAllByUserUseCase } from '../src/modules/transaction/application/archiveAllByUser';
import { GetArchivedTransactionsUseCase } from '../src/modules/transaction/application/getArchivedTransactions';
import { BudgetModule } from '../src/modules/budget/budgetModule';
import { BudgetRepository } from '../src/modules/budget/domain/budgetRepository';
import { BudgetEntity, CreateBudgetData } from '../src/modules/budget/domain/budgetEntity';
import { CreateBudgetUseCase } from '../src/modules/budget/application/createBudget';
import { GetBudgetsUseCase } from '../src/modules/budget/application/getBudgets';
import { BudgetService } from '../src/modules/budget/application/budgetService';
import { DebtModule } from '../src/modules/debt/debtModule';
import { SubscriptionModule } from '../src/modules/subscription/subscriptionModule';
import { SubscriptionRepository } from '../src/modules/subscription/domain/subscriptionRepository';
import { CreateSubscriptionDTO, Subscription } from '../src/modules/subscription/domain/subscription';
import { SqliteUsageLimitRepository } from '../src/modules/subscription/infrastructure/SqliteUsageLimitRepository';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';

/**
 * FT-162: the legacy routes that still carry a userId — `:userId` in the path (transactions, budgets, debts, dashboard,
 * subscription status) or `userId` in the body (subscription actions, `POST /api/transactions`) — act only for the
 * signed-in user, and refusing someone else's id touches nothing. Before, user resolution ran before the ownership
 * check and created a `users` row for any Telegram id it was given, and a userId that was not a string gave 500.
 *
 * Every request signs in through the local dev header as ME, over 127.0.0.1 (the shared test server).
 */

const ME = 131184740;
const MINE = String(ME);
const SOMEONE = '597843119';

/** Budgets: none stored; remembers whose budgets it was asked for. */
class NoBudgets implements BudgetRepository {
  readonly askedFor: string[] = [];
  async create(data: CreateBudgetData): Promise<BudgetEntity> {
    this.askedFor.push(data.userId);
    return { ...data, id: 'budget-1', spent: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() } as unknown as BudgetEntity;
  }
  async findById(): Promise<BudgetEntity | null> { return null; }
  async findByUserId(userId: string): Promise<BudgetEntity[]> { this.askedFor.push(userId); return []; }
  async findActiveByUserId(userId: string): Promise<BudgetEntity[]> { this.askedFor.push(userId); return []; }
  async update(): Promise<BudgetEntity> { throw new Error('not stored'); }
  async delete(): Promise<void> {}
  async getBudgetSummary(): Promise<null> { return null; }
  async getBudgetSummaries(userId: string): Promise<[]> { this.askedFor.push(userId); return []; }
  async updateSpentAmount(): Promise<void> {}
}

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

/** Debts: the route answers once the use case is reached; remembers whose debts it was asked for. */
function debtsFor(askedFor: string[]): DebtModule {
  const answer = (userId: string) => { askedFor.push(userId); return Promise.resolve({ success: true, data: [] }); };
  return {
    createDebtUseCase: { execute: (data: { userId: string }) => answer(data.userId) },
    getDebtsUseCase: { executeGetAll: answer, executeGetByType: answer, executeGetSummary: answer },
  } as unknown as DebtModule;
}

const unused = {} as never;

let db: TestDatabase;
let server: TestServer;
let budgets: NoBudgets;
let subscriptions: NoSubscriptions;
let debtsAskedFor: string[];
let records: ReturnType<typeof recordsOn>;

beforeAll(async () => {
  db = await openMigratedDatabase();
  records = recordsOn(db.dataSource);
  const users = new UserModule(new SqliteUserRepository(db.dataSource));
  budgets = new NoBudgets();
  subscriptions = new NoSubscriptions();
  debtsAskedFor = [];

  const analytics = new AnalyticsService(records.repository);
  const budgetService = new BudgetService(budgets, records.repository);
  const budgetModule = {
    createBudgetUseCase: new CreateBudgetUseCase(budgets),
    getBudgetsUseCase: new GetBudgetsUseCase(budgets),
    budgetService,
  } as unknown as BudgetModule;
  const subscriptionModule = new SubscriptionModule(subscriptions, new SqliteUsageLimitRepository(db.dataSource), {
    freeLimitsEnabled: false,
  });

  server = await startTestServer({
    '/transactions': createTransactionRouter(
      records.create, unused, analytics, new GetUserTransactionsUseCase(records.repository), unused, unused, unused,
      unused, unused, unused, unused, new ArchiveAllByUserUseCase(records.repository),
      new GetArchivedTransactionsUseCase(records.repository), subscriptionModule, users
    ),
    '/budgets': createBudgetRouter(budgetModule, users),
    '/debts': createDebtRouter(debtsFor(debtsAskedFor), users),
    '/dashboard': createDashboardRouter(analytics, budgetService, subscriptionModule, users),
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
const CREATED = { status: 201 };
// The insights are for premium users: ownership passes, then the premium check refuses, as before
const PREMIUM_ONLY = { status: 403, code: 'PREMIUM_REQUIRED' };
const BUDGET = { name: 'Еда', amount: 1000000, period: 'monthly', categoryIds: [] };
const DEBT = { type: 'i_owe', personName: 'Ali', amount: 50000, currency: 'UZS' };

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
  { method: 'POST', path: id => `/api/budgets/users/${id}/budgets`, own: CREATED, body: BUDGET },
  { method: 'GET', path: id => `/api/budgets/users/${id}/budgets`, own: OK },
  { method: 'GET', path: id => `/api/budgets/users/${id}/budgets/summaries`, own: OK },
  { method: 'GET', path: id => `/api/budgets/users/${id}/budgets/alerts`, own: OK },
  { method: 'POST', path: id => `/api/debts/user/${id}`, own: CREATED, body: DEBT },
  { method: 'GET', path: id => `/api/debts/user/${id}`, own: OK },
  { method: 'GET', path: id => `/api/debts/user/${id}/summary`, own: OK },
  { method: 'GET', path: id => `/api/dashboard/insights/${id}`, own: PREMIUM_ONLY },
  { method: 'GET', path: id => `/api/dashboard/insights/${id}/weekly`, own: PREMIUM_ONLY },
  { method: 'GET', path: id => `/api/dashboard/insights/${id}/health-score`, own: PREMIUM_ONLY },
  { method: 'GET', path: id => `/api/dashboard/alerts/${id}`, own: OK },
  { method: 'GET', path: id => `/api/dashboard/alerts/${id}/summary`, own: OK },
  { method: 'GET', path: id => `/api/dashboard/${id}`, own: OK },
  { method: 'GET', path: id => `/api/dashboard/${id}/quick-stats`, own: OK },
  { method: 'GET', path: id => `/api/subscription/${id}`, own: OK },
];

const named = PATH_ROUTES.map(route => [`${route.method} ${route.path(':userId')}`, route] as const);

describe('a legacy route with :userId in the path (FT-162)', () => {
  it.each(named)('%s: someone else’s id is 403 and adds no user', async (_name, route) => {
    const before = await telegramIds();

    for (const someone of [SOMEONE, `0${MINE}`, `${MINE}0`]) {
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

  it('the own id reaches the use cases as the own user, not as the id in the path', async () => {
    await call('GET', `/api/budgets/users/${MINE}/budgets`);
    await call('GET', `/api/debts/user/${MINE}/summary`);

    const uuid = await myUuid();
    expect(budgets.askedFor.at(-1)).toBe(uuid);
    expect(debtsAskedFor.at(-1)).toBe(uuid);
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

  it('grant (admin) refuses a target userId that is not a string with 400, not 500', async () => {
    const admins = process.env.ADMIN_TELEGRAM_IDS;
    process.env.ADMIN_TELEGRAM_IDS = MINE;
    try {
      for (const userId of [Number(SOMEONE), [SOMEONE]]) {
        const res = await call('POST', '/api/subscription/grant', { userId, grantedBy: 'test', durationDays: 30 });
        expect({ userId, status: res.status, code: res.body?.code }).toEqual({ userId, status: 400, code: 'INVALID_USER_ID' });
      }
    } finally {
      process.env.ADMIN_TELEGRAM_IDS = admins;
    }
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
