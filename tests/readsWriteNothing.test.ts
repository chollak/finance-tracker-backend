import 'reflect-metadata';
import express from 'express';
import { buildServer } from '../src/delivery/web/express/expressServer';
import { TransactionModule } from '../src/modules/transaction/transactionModule';
import { CategoryModule } from '../src/modules/category/categoryModule';
import { SqliteCategoryRepository } from '../src/modules/category/infrastructure/SqliteCategoryRepository';
import { AccountModule } from '../src/modules/account/accountModule';
import { FxModule } from '../src/modules/fx/fxModule';
import { SqliteFxRateRepository } from '../src/modules/fx/infrastructure/SqliteFxRateRepository';
import { ExportModule } from '../src/modules/export/exportModule';
import { AuditModule } from '../src/modules/audit/auditModule';
import { SqliteAuditRepository } from '../src/modules/audit/infrastructure/SqliteAuditRepository';
import { SqliteGoalRepository } from '../src/modules/audit/infrastructure/SqliteGoalRepository';
import { AuthModule } from '../src/modules/auth/authModule';
import { SqliteLoginTokenRepository } from '../src/modules/auth/infrastructure/SqliteLoginTokenRepository';
import { SubscriptionModule } from '../src/modules/subscription/subscriptionModule';
import { SqliteSubscriptionRepository } from '../src/modules/subscription/infrastructure/SqliteSubscriptionRepository';
import { SqliteUsageLimitRepository } from '../src/modules/subscription/infrastructure/SqliteUsageLimitRepository';
import { UserModule } from '../src/modules/user/userModule';
import { todayDateOnly } from '../src/shared/domain/dates/dateOnly';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * #335: reading changes nothing. Every request resolved its user through getOrCreate, and getOrCreate wrote
 * `users.last_seen_at` for a user it found — each screen the Mini App opened was a write to SQLite, and with the file
 * locked every read failed before its use case. Nothing read the column, so nothing writes it now.
 *
 * Measured twice. Every statement the database gets on a pass must be a `SELECT` or a `PRAGMA`: an `INSERT OR IGNORE`
 * that skips its row changes nothing, yet takes the write lock and fails on a locked file all the same. And
 * `total_changes()` — the rows every INSERT, UPDATE and DELETE on the connection changed (TypeORM keeps one connection
 * to SQLite) — stays as it was, so a write to any table, not only `users`, shows.
 */

const TELEGRAM_ID = 4343;
/** What a read may send: anything else — INSERT, UPDATE, DELETE, REPLACE, a transaction — is or leads to a write. */
const READ_ONLY_SQL = /^\s*(SELECT|PRAGMA)\b/i;
/** No screen reads quick capture: buildServer gets an empty module for it. */
const unusedModule = new Proxy({}, { get: () => () => ({}) }) as any;

describe('the Mini App reads write nothing for a known user (#335)', () => {
  let db: TestDatabase;
  let api: LoopbackServer;
  let transactionModule: TransactionModule;
  let userModule: UserModule;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    // Wired the way createModules() wires them, on the test database
    const records = recordsOn(db.dataSource);
    transactionModule = new TransactionModule(records.repository);
    const categoryModule = new CategoryModule(new SqliteCategoryRepository(db.dataSource));
    const accountModule = new AccountModule(records.accountRepository, undefined, records.moveRepository);
    userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
    transactionModule.setCategoryResolver(categoryModule.getCatalog());
    transactionModule.setAccountResolver(accountModule.getBook());
    accountModule.getBook().setDefaultAccountSource(userId => userModule.defaultAccountId(userId));
    accountModule.setRecordSource({ recordsOf: (userId, accountId) => transactionModule.recordsOfAccount(userId, accountId) });
    const fxModule = new FxModule(new SqliteFxRateRepository(db.dataSource), { fetchUsdRate: async () => null }, {
      get: userId => userModule.ownUsdRate(userId),
      set: (userId, rate) => userModule.setOwnUsdRate(userId, rate),
    });
    const exportModule = new ExportModule({
      records: userId => records.repository.findByUserId(userId),
      moves: userId => records.moveRepository.findByUserId(userId),
      accounts: userId => records.accountRepository.findByUserId(userId),
    }, { sendFile: jest.fn() });
    const auditModule = new AuditModule({
      audits: new SqliteAuditRepository(db.dataSource),
      goals: new SqliteGoalRepository(db.dataSource),
      sources: {
        recordsBetween: (userId, from, to) => records.repository.getByUserIdAndDateRange(userId, from, to),
        firstRecordDate: userId => records.repository.findFirstRecordDate(userId),
        categories: userId => categoryModule.getCatalog().listForUser(userId),
        usdRateMinor: async () => null,
      },
    });
    const authModule = new AuthModule(new SqliteLoginTokenRepository(db.dataSource), {
      botUsername: { username: async () => 'kapelka_test_bot' },
    });
    const subscriptionModule = new SubscriptionModule(
      new SqliteSubscriptionRepository(db.dataSource),
      new SqliteUsageLimitRepository(db.dataSource),
      { exists: userId => userModule.exists(userId) },
      { freeLimitsEnabled: false }
    );

    const app = express();
    app.use('/api', buildServer(
      transactionModule, userModule, subscriptionModule, unusedModule,
      { categoryModule, accountModule, fxModule, exportModule, authModule, auditModule }
    ));
    api = await listenOnLoopback(app);
  });

  afterEach(async () => {
    await api.close();
    await db.close();
  });

  /** Signed in as TELEGRAM_ID through the local dev header, as the Mini App is in development. */
  async function get(url: string): Promise<{ url: string; status: number }> {
    const res = await fetch(`${api.baseUrl}/api${url}`, { headers: { 'X-Dev-User-Id': String(TELEGRAM_ID) } });
    // Read to the end: the answer is whole, and whatever the route wrote is in, before the count
    await res.text();
    return { url, status: res.status };
  }

  const writes = async (): Promise<number> => Number((await db.dataSource.query(`SELECT total_changes() AS n`))[0].n);

  /** The statements the database got while `run` ran, read off TypeORM's query log, and those of them that write. */
  async function statementsOf(run: () => Promise<void>): Promise<{ sent: number; writing: string[] }> {
    const logged = jest.spyOn(db.dataSource.logger, 'logQuery');
    try {
      await run();
      const sql = logged.mock.calls.map(([query]) => query);
      return { sent: sql.length, writing: sql.filter(query => !READ_ONLY_SQL.test(query)) };
    } finally {
      logged.mockRestore();
    }
  }

  /** Every GET a Pastel screen sends (webapp `API_ENDPOINTS`), for the user's own account, category and record. */
  function screenReads(ids: { accountId: string; categoryId: string; recordId: string }): string[] {
    // Today and this month the way the app counts them — in Tashkent
    const today = todayDateOnly();
    const month = today.slice(0, 7);
    return [
      '/settings',
      '/categories',
      '/accounts',
      `/accounts/${ids.accountId}/operations`,
      '/rates/usd',
      '/transactions',
      `/transactions/totals?from=${month}-01&to=${today}`,
      '/transactions/frequent',
      `/transactions/${ids.recordId}`,
      '/analytics?type=expense',
      `/analytics/categories/${ids.categoryId}?month=${month}`,
      '/audits/current',
      '/goals',
      `/subscription/${TELEGRAM_ID}`,
      '/auth/session',
      '/auth/web-login',
      '/export',
    ];
  }

  /** The user, made by their first request, with one record: the ids the screens read by. */
  async function knownUserWithRecord(): Promise<string[]> {
    // The first request of a new user makes the user, the starter categories and «Карта» (FT-140)
    expect((await get('/settings')).status).toBe(200);
    const userId = (await userModule.getGetOrCreateUserUseCase().execute({ telegramId: String(TELEGRAM_ID) })).id;
    const created = await transactionModule.getCreateTransactionUseCase().execute({
      userId, amount: 25000, type: 'expense', category: 'Кафе', description: 'кофе', date: todayDateOnly(),
    } as never);
    if (!created.success) throw created.error;
    const [record] = await db.dataSource.query(
      `SELECT account_id AS accountId, category_id AS categoryId FROM transactions WHERE id = ?`, [created.data]
    );
    const reads = screenReads({ accountId: record.accountId, categoryId: record.categoryId, recordId: created.data });

    // A read that makes a row once makes it here: the subscription status adds the month's usage counter (`usage_limits`)
    const first = await Promise.all(reads.map(get));
    expect(first.filter(res => res.status !== 200).map(res => `${res.url} ${res.status}`)).toEqual([]);
    return reads;
  }

  it('every screen read, one after another, answers 200 and changes no row', async () => {
    const reads = await knownUserWithRecord();

    const changed: Record<string, number> = {};
    const writing: Record<string, string[]> = {};
    let sent = 0;
    for (const url of reads) {
      const before = await writes();
      let status = 0;
      const statements = await statementsOf(async () => { status = (await get(url)).status; });
      changed[`${url} ${status}`] = (await writes()) - before;
      sent += statements.sent;
      if (statements.writing.length > 0) writing[url] = statements.writing;
    }

    // The log does see the reads — an empty one would let any statement through — and none of them writes
    expect(sent).toBeGreaterThan(reads.length);
    expect(writing).toEqual({});
    expect(changed).toEqual(Object.fromEntries(reads.map(url => [`${url} 200`, 0])));
    const [{ last_seen_at: lastSeenAt }] = await db.dataSource.query(`SELECT last_seen_at FROM users WHERE telegram_id = ?`, [String(TELEGRAM_ID)]);
    expect(lastSeenAt).toBeNull();
  });

  it('the screen reads sent together, as Home sends them, change no row either', async () => {
    const reads = await knownUserWithRecord();
    const before = await writes();

    let again: Array<{ url: string; status: number }> = [];
    const statements = await statementsOf(async () => { again = await Promise.all(reads.map(get)); });

    expect(again.filter(res => res.status !== 200).map(res => `${res.url} ${res.status}`)).toEqual([]);
    expect(statements.sent).toBeGreaterThan(reads.length);
    expect(statements.writing).toEqual([]);
    expect(await writes()).toBe(before);
  });
});
