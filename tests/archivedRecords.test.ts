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
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { todayDateOnly } from '../src/shared/domain/dates/dateOnly';
import { prepareDatabaseOnce, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * #273: nothing archives a record or brings one back any more — the archive's routes are gone, and no writer sets
 * `isArchived`. A record archived before stays in the database as it is and stays hidden everywhere the user reads,
 * as decision Д7 (2026-10-16) and the export of FT-126 say: Home, History and its search, totals, balances, analytics,
 * the export and the bot's summaries. It is neither shown in one place and missing in another, nor counted twice.
 * Bringing such records back is a change of real data — only by Shukur's «да».
 */

const TELEGRAM_ID = 4273;
// The default account opens today and counts records from its opening date on (FT-101)
const TODAY = todayDateOnly();
const MONTH = TODAY.slice(0, 7);

describe('a record archived before #273 stays hidden everywhere (Д7)', () => {
  const migrated = prepareDatabaseOnce();
  let db: TestDatabase;
  let api: LoopbackServer;
  let transactionModule: TransactionModule;
  let ownerId: string;
  let keptId: string;
  let archivedId: string;

  beforeEach(async () => {
    db = await migrated.open();
    // Wired the way createModules() wires them, on the test database
    const records = recordsOn(db.dataSource);
    transactionModule = new TransactionModule(records.repository);
    const categoryModule = new CategoryModule(new SqliteCategoryRepository(db.dataSource));
    const accountModule = new AccountModule(records.accountRepository, undefined, records.moveRepository);
    const userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
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

    const app = express();
    app.use('/api', buildServer(transactionModule, userModule, undefined, undefined, { categoryModule, accountModule, fxModule, exportModule }));
    api = await listenOnLoopback(app);

    ownerId = (await userModule.getGetOrCreateUserUseCase().execute({ telegramId: String(TELEGRAM_ID) })).id;
    keptId = await recordOf(10000, 'кофе');
    archivedId = await recordOf(25000, 'кофе в зёрнах');
    await records.markArchived(archivedId);
  });

  afterEach(async () => {
    await api.close();
    await db.close();
  });

  async function recordOf(amount: number, description: string): Promise<string> {
    const created = await transactionModule.getCreateTransactionUseCase().execute({
      userId: ownerId, amount, type: 'expense', category: 'Кафе', description, date: TODAY,
    } as never);
    if (!created.success) throw created.error;
    return created.data;
  }

  /** Signed in as TELEGRAM_ID through the local dev header, as the Mini App is in development. */
  async function call(method: string, url: string, body?: unknown): Promise<{ status: number; body: any; text: string }> {
    const res = await fetch(`${api.baseUrl}/api${url}`, {
      method,
      headers: { 'X-Dev-User-Id': String(TELEGRAM_ID), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = res.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : null;
    return { status: res.status, body: json, text };
  }

  const ids = (items: Array<{ id: string }>) => items.map(item => item.id);

  it('Home: not among the recent records, not in the month tiles, not in the balance', async () => {
    const recent = await call('GET', '/transactions?limit=5');
    const totals = await call('GET', `/transactions/totals?from=${TODAY}&to=${TODAY}`);
    const accounts = await call('GET', '/accounts');

    expect(ids(recent.body.data.items)).toEqual([keptId]);
    expect(totals.body.data).toMatchObject({ expenseMinor: 1_000_000, recordCount: 1 });
    expect(accounts.body.data).toMatchObject({ totalMinor: -1_000_000 });
  });

  it('History and its search: not listed, not in the sum of what was found', async () => {
    const history = await call('GET', '/transactions');
    const search = await call('GET', `/transactions?q=${encodeURIComponent('кофе')}`);

    expect(ids(history.body.data.items)).toEqual([keptId]);
    expect(ids(search.body.data.items)).toEqual([keptId]);
    expect(search.body.data.summary).toMatchObject({ count: 1, netMinor: -1_000_000 });
  });

  it('analytics of the month and the bot’s summaries: not counted', async () => {
    const analytics = await call('GET', `/analytics?month=${MONTH}`);
    const day = await transactionModule.getPeriodTotalsUseCase().forPeriod(ownerId, TODAY, TODAY);

    expect(analytics.status).toBe(200);
    expect(analytics.body.data).toMatchObject({ totalMinor: 1_000_000 });
    expect(day).toMatchObject({ expenseMinor: 1_000_000, recordCount: 1 });
  });

  it('the export: not in the file', async () => {
    const file = await call('GET', '/export');

    expect(file.status).toBe(200);
    expect(file.text).toContain(';кофе');
    expect(file.text).not.toContain('кофе в зёрнах');
  });

  it('by its id: not found to open, change or delete, and the row stays as it was', async () => {
    const opened = await call('GET', `/transactions/${archivedId}`);
    const changed = await call('PUT', `/transactions/${archivedId}`, { description: 'чай' });
    const deleted = await call('DELETE', `/transactions/${archivedId}`);

    expect([opened.status, changed.status, deleted.status]).toEqual([404, 404, 404]);
    const [row] = await db.dataSource.query(
      'SELECT isArchived, deleted_at AS deletedAt, description, amount_minor AS amountMinor FROM transactions WHERE id = ?',
      [archivedId]
    );
    expect(row).toEqual({ isArchived: 1, deletedAt: null, description: 'кофе в зёрнах', amountMinor: 2_500_000 });
  });
});
