import { createTransactionRouter } from '../src/modules/transaction/presentation/controllers/transactionController';
import { GetPeriodTotalsUseCase } from '../src/modules/transaction/application/getPeriodTotals';
import { PeriodTotalsService } from '../src/modules/transaction/application/periodTotalsService';
import { AccountModule } from '../src/modules/account/accountModule';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { createSettingsRoutes } from '../src/modules/user/presentation/controllers/settingsController';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { startTestServer, TestServer } from './helpers/testServer';

const unused = { execute: jest.fn() } as never;
const sum = (value: number) => value * 100;

/**
 * FT-111: the month tiles on Home read income and expenses of a period from the one totals service
 * (FT-103), through a route that takes the user only from authentication.
 */
describe('period totals for Home (FT-111)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;
  let rateMinor: number | null;
  let totals: GetPeriodTotalsUseCase;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
    rateMinor = 1265000; // 12 650,00 сум за $1
    const service = new PeriodTotalsService({ effectiveUsdRate: async () => (rateMinor === null ? null : { rateMinor }) });
    totals = new GetPeriodTotalsUseCase(records.repository, service);
  });

  afterEach(async () => {
    await db.close();
  });

  async function record(overrides: Partial<Transaction>, userId = 'user-1') {
    const created = await records.create.execute({
      userId, amount: 10000, type: 'expense', category: 'Другое', description: 'x', date: '2026-10-10', ...overrides,
    });
    if (!created.success) throw created.error;
    return created.data;
  }

  async function dollarAccount(userId = 'user-1') {
    const created = await new AccountModule(records.accountRepository, undefined, records.moveRepository)
      .getCreateAccountUseCase()
      .execute({ userId, body: { name: 'Доллары', kind: 'cash', currency: 'USD', openingDate: '2026-10-01' } });
    if (!created.success) throw created.error;
    return created.data;
  }

  const october = async (userId = 'user-1') => {
    const result = await totals.execute({ userId, query: { from: '2026-10-01', to: '2026-10-31' } });
    if (!result.success) throw result.error;
    return result.data;
  };

  it('sums income and real expenses of the period in сум minor units', async () => {
    await record({ type: 'income', amount: 12500000, category: 'Зарплата', date: '2026-10-13' });
    await record({ amount: 186400, category: 'Продукты', date: '2026-10-14' });
    await record({ amount: 24000, category: 'Транспорт', date: '2026-10-31' });
    await record({ amount: 999000, date: '2026-09-30' }); // September
    await record({ amount: 777000, date: '2026-11-01' }); // November
    await record({ amount: 55000 }, 'user-2'); // someone else

    expect(await october()).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
      incomeMinor: sum(12500000),
      expenseMinor: sum(186400 + 24000),
      netMinor: sum(12500000 - 186400 - 24000),
      recordCount: 3,
      needsReview: { count: 0, totalMinor: 0 },
      excludedMovementsMinor: 0,
      usd: { present: false, missingRate: false, rateMinor: null },
    });
  });

  it('follows the totals service: dollars at the rate, review and movements apart, deleted and archived out', async () => {
    const usd = await dollarAccount();
    await record({ type: 'income', amount: 1000000, category: 'Зарплата' });
    await record({ type: 'income', amountMinor: 30000, amount: undefined, currency: 'USD', accountId: usd.id, category: 'Фриланс' }); // 300,00 USD
    await record({ amount: 45000, needsReview: true });
    await record({ amount: 500000, semanticType: 'own_transfer' });
    const deleted = await record({ amount: 70000 });
    const archived = await record({ amount: 80000 });
    await records.repository.delete(deleted);
    await records.repository.archive(archived);

    const result = await october();
    // 300 × 12 650 = 3 795 000 сум
    expect(result.incomeMinor).toBe(sum(1000000 + 3795000));
    expect(result.expenseMinor).toBe(0);
    expect(result.needsReview).toEqual({ count: 1, totalMinor: sum(45000) });
    expect(result.excludedMovementsMinor).toBe(sum(500000));
    expect(result.usd).toEqual({ present: true, missingRate: false, rateMinor: 1265000 });
  });

  it('leaves dollars out without a rate and says so', async () => {
    rateMinor = null;
    const usd = await dollarAccount();
    await record({ type: 'income', amountMinor: 30000, amount: undefined, currency: 'USD', accountId: usd.id, category: 'Фриланс' });
    await record({ amount: 18000 });

    const result = await october();
    expect(result.incomeMinor).toBe(0);
    expect(result.expenseMinor).toBe(sum(18000));
    expect(result.usd).toEqual({ present: true, missingRate: true, rateMinor: null });
  });

  it('refuses a period it cannot read', async () => {
    for (const query of [
      {}, { from: '2026-10-01' }, { to: '2026-10-31' }, { from: '2026-10-32', to: '2026-10-31' },
      { from: '2026-10-31', to: '2026-10-01' }, { from: ['2026-10-01'], to: '2026-10-31' },
    ]) {
      const result = await totals.execute({ userId: 'user-1', query });
      expect(result.success).toBe(false);
    }
  });

  describe('GET /api/transactions/totals', () => {
    let server: TestServer;

    beforeEach(async () => {
      const userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
      server = await startTestServer({
        '/transactions': createTransactionRouter(
          records.create, unused, unused, unused, unused, unused, records.update, unused, unused, unused, unused, unused,
          unused, undefined, userModule, undefined, totals
        ),
        '/settings': createSettingsRoutes(userModule),
      });
    });

    afterEach(async () => {
      await server.close();
    });

    it('answers the current user\'s totals and no one else\'s', async () => {
      const userId = (await server.request('GET', '/api/settings', { devUser: 4242 })).body.data.userId;
      await record({ userId, amount: 25000, category: 'Кафе' });
      await record({ userId, type: 'income', amount: 300000, category: 'Зарплата' });
      await record({ userId: 'someone-else', amount: 99000 });

      const res = await server.request('GET', '/api/transactions/totals?from=2026-10-01&to=2026-10-31', { devUser: 4242 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ incomeMinor: sum(300000), expenseMinor: sum(25000), recordCount: 2 });

      expect((await server.request('GET', '/api/transactions/totals?from=2026-10-01&to=2026-10-31')).status).toBe(401);
      expect((await server.request('GET', '/api/transactions/totals?from=2026-10-01', { devUser: 4242 })).status).toBe(400);
    });
  });
});
