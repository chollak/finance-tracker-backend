import { AccountModule } from '../src/modules/account/accountModule';
import { createAccountRoutes } from '../src/modules/account/presentation/accountController';
import { createMoveRoutes } from '../src/modules/account/presentation/moveController';
import { dealRateMinor } from '../src/modules/account/domain/accountMove';
import { AnalyticsService } from '../src/modules/transaction/application/analyticsService';
import { PeriodTotalsService } from '../src/modules/transaction/application/periodTotalsService';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { createSettingsRoutes } from '../src/modules/user/presentation/controllers/settingsController';
import { todayDateOnly } from '../src/shared/domain/dates/dateOnly';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { startTestServer, TestServer } from './helpers/testServer';

const OPENED = '2026-10-01';
const sum = (value: number) => value * 100;

describe('transfers, exchanges and adjustments (FT-104)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;
  let accounts: AccountModule;
  let cbuRateOn: jest.Mock;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
    accounts = new AccountModule(records.accountRepository, undefined, records.moveRepository);
    cbuRateOn = jest.fn().mockResolvedValue({ rateMinor: 1265000 });
    accounts.setCbuRates({ cbuRateOn });
    accounts.setRecordSource({
      recordsOf: async (userId, accountId) => (await records.repository.findByUserId(userId)).filter(r => r.accountId === accountId),
    });
  });

  afterEach(async () => {
    await db.close();
  });

  async function account(name: string, kind: 'cash' | 'card', currency: 'UZS' | 'USD' = 'UZS', openingBalanceMinor = 0, userId = 'user-1') {
    const created = await accounts.getCreateAccountUseCase().execute({
      userId, body: { name, kind, currency, openingBalanceMinor, openingDate: OPENED },
    });
    if (!created.success) throw created.error;
    return created.data;
  }

  /** «Карта», moved to the same opening date as the others. */
  async function card(userId = 'user-1') {
    const [first] = await accounts.getBook().listForUser(userId);
    await db.dataSource.query(`UPDATE accounts SET opening_date = ? WHERE id = ?`, [OPENED, first.id]);
    return { ...first, openingDate: OPENED };
  }

  const move = (body: Record<string, unknown>, userId = 'user-1') => accounts.getCreateMoveUseCase().execute({ userId, body });
  const setDeleted = (moveId: string, deleted: boolean, userId = 'user-1') =>
    accounts.getSetMoveDeletedUseCase().execute({ userId, moveId, deleted });

  async function balances(userId = 'user-1') {
    const summary = await accounts.getBook().summary(userId);
    return Object.fromEntries(summary.accounts.map(a => [a.name, a.balanceMinor]));
  }

  it('a transfer moves money between the two accounts and stays out of analytics', async () => {
    const from = await card();
    const to = await account('Наличные', 'cash');
    const expense = await records.create.execute({
      userId: 'user-1', accountId: from.id, amount: 25000, type: 'expense', category: 'Кафе', description: 'кофе', date: '2026-10-16',
    });
    expect(expense.success).toBe(true);

    const result = await move({ kind: 'transfer', fromAccountId: from.id, toAccountId: to.id, amountMinor: sum(500000), date: '2026-10-16' });

    expect(result.success && result.data).toMatchObject({
      kind: 'transfer', fromAmountMinor: sum(500000), toAmountMinor: sum(500000), dealRateMinor: null, cbuRateMinor: null, deletedAt: null,
    });
    expect(await balances()).toEqual({ 'Карта': sum(-525000), 'Наличные': sum(500000) });

    // Money changed accounts; nothing was spent: analytics and day totals see the coffee only
    const analytics = new AnalyticsService(records.repository, new PeriodTotalsService());
    expect((await analytics.getAnalyticsSummary('user-1')).totalExpense).toBe(25000);
    const totals = new PeriodTotalsService().summarize('user-1', await records.repository.findByUserId('user-1'));
    expect((await totals).expenseMinor).toBe(sum(25000));
  });

  it('an exchange keeps the deal rate and the Central Bank rate on its date', async () => {
    const uzs = await card();
    const usd = await account('Доллары', 'cash', 'USD', 10000);

    const result = await move({
      kind: 'exchange', fromAccountId: usd.id, toAccountId: uzs.id, fromAmountMinor: 10000, toAmountMinor: sum(1260000), date: '2026-10-12',
    });

    expect(result.success && result.data).toMatchObject({ kind: 'exchange', dealRateMinor: 1260000, cbuRateMinor: 1265000, date: '2026-10-12' });
    expect(cbuRateOn).toHaveBeenCalledWith('2026-10-12');
    expect(await balances()).toEqual({ 'Карта': sum(1260000), 'Доллары': 0 });
  });

  it('an exchange without a known Central Bank rate is still recorded', async () => {
    const uzs = await card();
    const usd = await account('Доллары', 'cash', 'USD');
    cbuRateOn.mockRejectedValue(new Error('offline'));

    const result = await move({ kind: 'exchange', fromAccountId: uzs.id, toAccountId: usd.id, fromAmountMinor: sum(1280000), toAmountMinor: 10000 });

    expect(result.success && result.data).toMatchObject({ dealRateMinor: 1280000, cbuRateMinor: null, date: todayDateOnly() });
  });

  it('computes the deal rate half up in both directions', () => {
    expect(dealRateMinor({ currency: 'USD', amountMinor: 10000 }, { currency: 'UZS', amountMinor: 126000000 })).toBe(1260000);
    expect(dealRateMinor({ currency: 'UZS', amountMinor: 128000000 }, { currency: 'USD', amountMinor: 10000 })).toBe(1280000);
    // 1 000 000 сум for $77.77 = 12 858.4286… сум per $1 → 1285843
    expect(dealRateMinor({ currency: 'UZS', amountMinor: 100000000 }, { currency: 'USD', amountMinor: 7777 })).toBe(1285843);
  });

  it('an adjustment records the difference with what is really on the account', async () => {
    const cash = await account('Наличные', 'cash', 'UZS', sum(500000));
    await card();

    const result = await move({ kind: 'adjustment', accountId: cash.id, balanceMinor: sum(480000) });

    expect(result.success && result.data).toMatchObject({ kind: 'adjustment', fromAccountId: null, toAccountId: cash.id, toAmountMinor: sum(-20000) });
    expect((await balances())['Наличные']).toBe(sum(480000));
    const same = await move({ kind: 'adjustment', accountId: cash.id, balanceMinor: sum(480000) });
    expect(!same.success && same.error.message).toBe('The balance already matches');
  });

  it('deleting brings both balances back, restoring takes them again; repeats are harmless', async () => {
    const from = await card();
    const to = await account('Наличные', 'cash');
    const created = await move({ kind: 'transfer', fromAccountId: from.id, toAccountId: to.id, amountMinor: sum(100000) });
    if (!created.success) throw created.error;

    const deleted = await setDeleted(created.data.id, true);
    expect(deleted.success && deleted.data.deletedAt).toBeInstanceOf(Date);
    expect(await balances()).toEqual({ 'Карта': 0, 'Наличные': 0 });
    expect((await setDeleted(created.data.id, true)).success).toBe(true);

    expect((await setDeleted(created.data.id, false)).success).toBe(true);
    expect(await balances()).toEqual({ 'Карта': sum(-100000), 'Наличные': sum(100000) });

    const stranger = await setDeleted(created.data.id, true, 'user-2');
    expect(!stranger.success && (stranger.error as { statusCode?: number }).statusCode).toBe(404);
  });

  it('refuses what cannot be a move, with an error that says why', async () => {
    const only = await card();
    const single = await move({ kind: 'transfer', fromAccountId: only.id, toAccountId: only.id, amountMinor: 100 });
    expect(!single.success && single.error.message).toMatch(/needs a second visible account/);

    const cash = await account('Наличные', 'cash');
    const usd = await account('Доллары', 'cash', 'USD');
    const hidden = await account('Старая', 'card');
    await accounts.getUpdateAccountUseCase().execute({ userId: 'user-1', accountId: hidden.id, body: { isHidden: true } });
    const foreign = await account('Чужой', 'card', 'UZS', 0, 'user-2');

    const cases: Array<[Record<string, unknown>, RegExp | number]> = [
      [{ kind: 'loan' }, /kind must be one of/],
      [{ kind: 'transfer', fromAccountId: only.id, toAccountId: only.id, amountMinor: 100 }, /must differ/],
      [{ kind: 'transfer', fromAccountId: only.id, toAccountId: usd.id, amountMinor: 100 }, /that is an exchange/],
      [{ kind: 'exchange', fromAccountId: only.id, toAccountId: cash.id, fromAmountMinor: 100, toAmountMinor: 100 }, /that is a transfer/],
      [{ kind: 'transfer', fromAccountId: only.id, toAccountId: hidden.id, amountMinor: 100 }, /hidden/],
      [{ kind: 'transfer', fromAccountId: only.id, toAccountId: foreign.id, amountMinor: 100 }, 404],
      [{ kind: 'transfer', fromAccountId: only.id, toAccountId: cash.id, amountMinor: 0 }, /amountMinor must be a positive/],
      [{ kind: 'transfer', fromAccountId: only.id, toAccountId: cash.id, amountMinor: 1.5 }, /amountMinor must be a positive/],
      [{ kind: 'exchange', fromAccountId: only.id, toAccountId: usd.id, fromAmountMinor: 100 }, /toAmountMinor must be a positive/],
      [{ kind: 'transfer', fromAccountId: only.id, toAccountId: cash.id, amountMinor: 100, date: '2026-09-30' }, /before the opening date/],
      [{ kind: 'transfer', fromAccountId: only.id, toAccountId: cash.id, amountMinor: 100, date: '2026-02-30' }, /date must be a date/],
      [{ kind: 'transfer', fromAccountId: only.id, toAccountId: cash.id, amountMinor: 100, note: 'x'.repeat(201) }, /note must be at most/],
      [{ kind: 'adjustment', accountId: cash.id, balanceMinor: 'много' }, /balanceMinor must be an integer/],
    ];
    for (const [body, expected] of cases) {
      const result = await move(body);
      expect(result.success).toBe(false);
      if (!result.success) {
        if (typeof expected === 'number') expect((result.error as { statusCode?: number }).statusCode).toBe(expected);
        else expect(result.error.message).toMatch(expected);
      }
    }
  });

  it('an account with moves can no longer change its currency', async () => {
    const from = await card();
    const to = await account('Наличные', 'cash');
    const created = await move({ kind: 'transfer', fromAccountId: from.id, toAccountId: to.id, amountMinor: 100 });
    if (!created.success) throw created.error;
    await setDeleted(created.data.id, true);

    const changed = await accounts.getUpdateAccountUseCase().execute({ userId: 'user-1', accountId: to.id, body: { currency: 'USD' } });
    expect(changed.success).toBe(false);
  });

  describe('/api/moves and /api/accounts/:id/operations', () => {
    let server: TestServer;
    let userModule: UserModule;

    beforeEach(async () => {
      userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
      server = await startTestServer({
        '/accounts': createAccountRoutes(accounts, userModule),
        '/moves': createMoveRoutes(accounts, userModule),
        '/settings': createSettingsRoutes(userModule),
      });
    });

    afterEach(async () => {
      await server.close();
    });

    const as = (method: string, url: string, body?: unknown) => server.request(method, url, { devUser: 4242, body });

    it('records a move, lists it among the records by day, deletes and restores it', async () => {
      const userId = (await as('GET', '/api/settings')).body.data.userId;
      const from = await card(userId);
      const cash = (await as('POST', '/api/accounts', { name: 'Наличные', kind: 'cash', currency: 'UZS', openingDate: OPENED })).body.data;
      const coffee = await records.create.execute({
        userId, accountId: from.id, amount: 25000, type: 'expense', category: 'Кафе', description: 'кофе', date: '2026-10-12',
      });
      const salary = await records.create.execute({
        userId, accountId: from.id, amount: 9000000, type: 'income', category: 'Зарплата', description: 'зарплата', date: '2026-09-28',
      });
      expect(coffee.success && salary.success).toBe(true);

      const created = await as('POST', '/api/moves', { kind: 'transfer', fromAccountId: from.id, toAccountId: cash.id, amountMinor: sum(300000), date: '2026-10-12' });
      expect(created.status).toBe(201);
      expect((await as('POST', '/api/moves', { kind: 'transfer', fromAccountId: from.id, toAccountId: from.id, amountMinor: 100 })).status).toBe(400);
      expect((await server.request('POST', '/api/moves', { body: { kind: 'transfer' } })).status).toBe(401);

      const operations = await as('GET', `/api/accounts/${from.id}/operations`);
      expect(operations.status).toBe(200);
      expect(operations.body.data.account).toMatchObject({ id: from.id, balanceMinor: sum(-325000) });
      const days = operations.body.data.days;
      expect(days.map((d: { date: string }) => d.date)).toEqual(['2026-10-12', '2026-09-28']);
      expect(days[0].operations.map((o: { type: string; amountMinor: number }) => [o.type, o.amountMinor])).toEqual([
        ['move', sum(-300000)],
        ['record', sum(-25000)],
      ]);
      expect(days[0].operations[0]).toMatchObject({ kind: 'transfer', counterpart: { id: cash.id, name: 'Наличные' }, countsInBalance: true });
      // Before the opening date: in the list, not in the balance
      expect(days[1].operations[0]).toMatchObject({ type: 'record', amountMinor: sum(9000000), countsInBalance: false });
      expect(days[1].operations[0].record).toMatchObject({ category: 'Зарплата', amountMinor: sum(9000000) });

      const inCash = (await as('GET', `/api/accounts/${cash.id}/operations?from=2026-10-01&to=2026-10-31`)).body.data;
      expect(inCash.days[0].operations[0]).toMatchObject({ type: 'move', amountMinor: sum(300000), counterpart: { id: from.id } });
      expect((await as('GET', `/api/accounts/${cash.id}/operations?from=октябрь`)).status).toBe(400);
      expect((await server.request('GET', `/api/accounts/${cash.id}/operations`, { devUser: 999 })).status).toBe(404);

      const moveId = created.body.data.id;
      expect((await server.request('DELETE', `/api/moves/${moveId}`, { devUser: 999 })).status).toBe(404);
      expect((await as('DELETE', `/api/moves/${moveId}`)).body.data.deletedAt).not.toBeNull();
      expect((await as('GET', `/api/accounts/${from.id}/operations`)).body.data.days[0].operations).toHaveLength(1);
      expect((await as('GET', '/api/accounts')).body.data.accounts.map((a: { balanceMinor: number }) => a.balanceMinor)).toEqual([sum(-25000), 0]);

      expect((await as('POST', `/api/moves/${moveId}/restore`)).body.data.deletedAt).toBeNull();
      expect((await as('GET', '/api/accounts')).body.data.accounts.map((a: { balanceMinor: number }) => a.balanceMinor)).toEqual([sum(-325000), sum(300000)]);
    });
  });
});
