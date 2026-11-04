import 'reflect-metadata';
import express from 'express';
import { createTransactionRouter } from '../src/modules/transaction/presentation/controllers/transactionController';
import { errorHandler, notFoundHandler } from '../src/delivery/web/express/middleware/errorMiddleware';
import { TransactionModule } from '../src/modules/transaction/transactionModule';
import { CategoryModule } from '../src/modules/category/categoryModule';
import { SqliteCategoryRepository } from '../src/modules/category/infrastructure/SqliteCategoryRepository';
import { AccountModule } from '../src/modules/account/accountModule';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { prepareDatabaseOnce, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * #265 (decision 2026-11-04): the debt module is gone outside the capture path, the data is not. A record a debt or a
 * debt payment wrote before Д2 keeps its link — `isDebtRelated`, `relatedDebtId`, the old category `debt` — and the
 * `debts` / `debt_payments` rows it points at stay. Such a record is read, changed, deleted and restored like any
 * other, and totals keep it out of income and expenses as a debt movement, as before.
 */

const TELEGRAM_ID = '131265000';
const DEBT_ID = 'debt-before-d2';
const DAY = '2026-10-20';

describe('a record once written by a debt is an ordinary record (#265)', () => {
  let db: TestDatabase;
  let api: LoopbackServer;
  let ownerId: string;
  const migrated = prepareDatabaseOnce();

  beforeEach(async () => {
    db = await migrated.open();
    const records = recordsOn(db.dataSource);
    const transactionModule = new TransactionModule(records.repository);
    const categoryModule = new CategoryModule(new SqliteCategoryRepository(db.dataSource));
    const accountModule = new AccountModule(records.accountRepository, undefined, records.moveRepository);
    const userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
    transactionModule.setCategoryResolver(categoryModule.getCatalog());
    transactionModule.setAccountResolver(accountModule.getBook());
    accountModule.getBook().setDefaultAccountSource(userId => userModule.defaultAccountId(userId));

    const app = express();
    app.use(express.json());
    // The records routes as buildServer() mounts them
    app.use('/api/transactions', createTransactionRouter(
      transactionModule.getCreateTransactionUseCase(),
      transactionModule.getTransactionHistoryUseCase(),
      transactionModule.getAnalyticsService(),
      transactionModule.getGetUserTransactionsUseCase(),
      transactionModule.getGetTransactionByIdUseCase(),
      transactionModule.getDeleteTransactionUseCase(),
      transactionModule.getUpdateTransactionUseCase(),
      transactionModule.getUpdateTransactionWithLearningUseCase(),
      transactionModule.getArchiveTransactionUseCase(),
      transactionModule.getUnarchiveTransactionUseCase(),
      transactionModule.getArchiveMultipleTransactionsUseCase(),
      transactionModule.getArchiveAllByUserUseCase(),
      transactionModule.getGetArchivedTransactionsUseCase(),
      undefined,
      userModule,
      transactionModule.getRestoreTransactionUseCase(),
      transactionModule.getPeriodTotalsUseCase()
    ));
    app.use('*', notFoundHandler);
    app.use(errorHandler);
    api = await listenOnLoopback(app);

    ownerId = (await userModule.getGetOrCreateUserUseCase().execute({ telegramId: TELEGRAM_ID })).id;
  });

  afterEach(async () => {
    await api.close();
    await db.close();
  });

  async function call(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
    const response = await fetch(`${api.baseUrl}/api/transactions${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Dev-User-Id': TELEGRAM_ID },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  /**
   * «Дал в долг: Азиз», 300 000 сум, the way CreateDebtUseCase wrote it before Д2: a `debts` row with a payment, and a
   * record that names it, in the old category `debt` (FT-099 moved it to «Другое»).
   */
  async function recordOfADebt(): Promise<string> {
    const records = recordsOn(db.dataSource);
    const created = await records.create.execute({
      userId: ownerId, amount: 300000, type: 'expense', category: 'Другое', semanticType: 'debt',
      description: 'Дал в долг: Азиз', date: DAY,
    } as never);
    if (!created.success) throw created.error;
    const id = created.data as unknown as string;

    await db.dataSource.query(
      'INSERT INTO debts (id, userId, type, personName, originalAmount, remainingAmount, relatedTransactionId) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [DEBT_ID, ownerId, 'owed_to_me', 'Азиз', 300000, 200000, id]
    );
    await db.dataSource.query(
      'INSERT INTO debt_payments (id, debtId, amount, paidAt) VALUES (?, ?, ?, ?)',
      ['payment-1', DEBT_ID, 100000, `${DAY} 10:00:00`]
    );
    await db.dataSource.query(
      'UPDATE transactions SET isDebtRelated = 1, relatedDebtId = ?, legacy_category = ? WHERE id = ?',
      [DEBT_ID, 'debt', id]
    );
    return id;
  }

  const debtRows = async () => ({
    debts: Number((await db.dataSource.query('SELECT COUNT(*) AS n FROM debts'))[0].n),
    payments: Number((await db.dataSource.query('SELECT COUNT(*) AS n FROM debt_payments'))[0].n),
  });

  it('is in the history and opens by its id', async () => {
    const id = await recordOfADebt();

    const history = await call('GET', '/');
    const one = await call('GET', `/${id}`);

    expect(history.status).toBe(200);
    expect(history.body.data.items.map((item: { id: string }) => item.id)).toEqual([id]);
    expect(one.status).toBe(200);
    expect(one.body.data).toMatchObject({
      id, amountMinor: 30_000_000, type: 'expense', semanticType: 'debt', category: 'Другое', description: 'Дал в долг: Азиз',
    });
  });

  it('stays out of income and expenses in totals, as a debt movement', async () => {
    await recordOfADebt();

    const totals = await call('GET', `/totals?from=${DAY}&to=${DAY}`);

    expect(totals.status).toBe(200);
    expect(totals.body.data).toMatchObject({ incomeMinor: 0, expenseMinor: 0, excludedMovementsMinor: 30_000_000 });
  });

  it('is changed like any record; the debt rows stay as they were', async () => {
    const id = await recordOfADebt();

    const changed = await call('PUT', `/${id}`, { amount: 250000, description: 'Азиз', semanticType: 'expense' });

    expect(changed.status).toBe(200);
    expect(changed.body.data).toMatchObject({ id, amountMinor: 25_000_000, description: 'Азиз', semanticType: 'expense' });
    expect(await debtRows()).toEqual({ debts: 1, payments: 1 });
  });

  it('is deleted and restored like any record; the debt rows stay as they were', async () => {
    const id = await recordOfADebt();

    const deleted = await call('DELETE', `/${id}`);
    const afterDelete = await call('GET', '/');
    const restored = await call('POST', `/${id}/restore`);
    const afterRestore = await call('GET', '/');

    expect(deleted.status).toBe(200);
    expect(afterDelete.body.data.items).toEqual([]);
    expect(restored.status).toBe(200);
    expect(afterRestore.body.data.items.map((item: { id: string }) => item.id)).toEqual([id]);
    expect(await debtRows()).toEqual({ debts: 1, payments: 1 });
  });
});
