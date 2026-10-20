import { GetCategoryAnalyticsUseCase, GetMonthAnalyticsUseCase } from '../src/modules/transaction/application/getMonthAnalytics';
import { PeriodTotalsService } from '../src/modules/transaction/application/periodTotalsService';
import { createAnalyticsRoutes } from '../src/modules/transaction/presentation/controllers/analyticsController';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { AccountModule } from '../src/modules/account/accountModule';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { createSettingsRoutes } from '../src/modules/user/presentation/controllers/settingsController';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { startTestServer, TestServer } from './helpers/testServer';

const sum = (value: number) => value * 100;
/** 14:00 in Tashkent on 14 October 2026. */
const NOW = new Date('2026-10-14T09:00:00Z');

/**
 * FT-120: `GET /api/analytics` and `GET /api/analytics/categories/:id` — where the money goes, compared fairly,
 * on the one totals service of FT-103 and a real SQLite file.
 */
describe('analytics API with fair comparison (FT-120)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;
  let rate: { rateMinor: number; source: 'cbu' | 'own' } | null;
  let monthAnalytics: GetMonthAnalyticsUseCase;
  let categoryAnalytics: GetCategoryAnalyticsUseCase;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
    rate = { rateMinor: 1265000, source: 'cbu' }; // 12 650,00 сум за $1
    const service = new PeriodTotalsService({ effectiveUsdRate: async () => rate });
    monthAnalytics = new GetMonthAnalyticsUseCase(records.repository, service, () => NOW);
    categoryAnalytics = new GetCategoryAnalyticsUseCase(records.repository, service, records.catalog, () => NOW);
  });

  afterEach(async () => {
    await db.close();
  });

  async function record(overrides: Partial<Transaction>, userId = 'user-1') {
    const created = await records.create.execute({
      userId, amount: 10000, type: 'expense', category: 'Кафе', description: 'x', date: '2026-10-10', ...overrides,
    });
    if (!created.success) throw created.error;
    return created.data;
  }

  async function categoryId(name: string, userId = 'user-1') {
    return (await records.catalog.listForUser(userId)).find(category => category.name === name)!.id;
  }

  async function month(query: Record<string, unknown>, userId = 'user-1') {
    const result = await monthAnalytics.execute({ userId, query });
    if (!result.success) throw result.error;
    return result.data;
  }

  async function ofCategory(name: string, query: Record<string, unknown> = {}, userId = 'user-1') {
    const result = await categoryAnalytics.execute({ userId, categoryId: await categoryId(name, userId), query });
    if (!result.success) throw result.error;
    return result.data;
  }

  describe('fair comparison', () => {
    beforeEach(async () => {
      await record({ amount: 100000, date: '2026-08-10' }); // the first month of recording
      await record({ amount: 40000, date: '2026-09-03' });
      await record({ amount: 50000, date: '2026-09-14' });
      await record({ amount: 999000, date: '2026-09-20' }); // after the same days
      await record({ amount: 60000, date: '2026-10-02' });
      await record({ amount: 70000, date: '2026-10-14' });
      await record({ amount: 30000, date: '2026-10-14', category: 'Продукты' });
    });

    it('compares the current month with the same days of the previous one', async () => {
      const result = await month({ month: '2026-10', type: 'expense' });

      expect(result).toMatchObject({
        month: '2026-10', type: 'expense', today: '2026-10-14', currentMonth: '2026-10', firstMonth: '2026-08',
        period: { from: '2026-10-01', to: '2026-10-14', wholeMonth: false },
        previous: { month: '2026-09', from: '2026-09-01', to: '2026-09-14', wholeMonth: false },
        comparable: true,
        totalMinor: sum(160000),
        previousTotalMinor: sum(90000),
        change: { kind: 'up', percent: 78, diffMinor: sum(70000) },
      });
      expect(result.categories.map(row => [row.name, row.amountMinor, row.previousMinor, row.sharePercent, row.change?.kind])).toEqual([
        ['Кафе', sum(130000), sum(90000), 81, 'up'],
        ['Продукты', sum(30000), 0, 19, 'new'],
      ]);
    });

    it('compares a past month whole with the whole month before it', async () => {
      const result = await month({ month: '2026-09', type: 'expense' });
      expect(result).toMatchObject({
        period: { from: '2026-09-01', to: '2026-09-30', wholeMonth: true },
        previous: { month: '2026-08', from: '2026-08-01', to: '2026-08-31', wholeMonth: true },
        totalMinor: sum(1089000),
        previousTotalMinor: sum(100000),
      });
    });

    it('has nothing to compare the first month with', async () => {
      const result = await month({ month: '2026-08', type: 'expense' });
      expect(result).toMatchObject({ previous: null, comparable: false, previousTotalMinor: null, change: null });
      expect(result.insight).toMatchObject({ kind: 'largest', name: 'Кафе', sharePercent: 100 });
    });

    it('reads the current month and expenses when not asked', async () => {
      expect(await month({})).toMatchObject({ month: '2026-10', type: 'expense', totalMinor: sum(160000) });
    });
  });

  it('compares income of an unfinished month with the whole previous month and never shows a fall', async () => {
    await record({ type: 'income', amount: 12500000, category: 'Зарплата', date: '2026-09-12' });
    await record({ type: 'income', amount: 180000, category: 'Кэшбэк', date: '2026-09-30' });
    await record({ type: 'income', amount: 12500000, category: 'Зарплата', date: '2026-10-13' });

    const result = await month({ month: '2026-10', type: 'income' });

    expect(result.previous).toEqual({ month: '2026-09', from: '2026-09-01', to: '2026-09-30', wholeMonth: true });
    expect(result.previousTotalMinor).toBe(sum(12680000));
    expect(result.change).toEqual({ kind: 'so_far', percent: 99, diffMinor: sum(-180000) });
    expect(result.categories.map(row => [row.name, row.amountMinor, row.change?.kind])).toEqual([
      ['Зарплата', sum(12500000), 'same'],
      ['Кэшбэк', 0, 'not_yet'],
    ]);
    // Nothing grew; a fall of an unfinished month is no insight
    expect(result.insight).toMatchObject({ kind: 'largest', name: 'Зарплата' });
  });

  it('leaves moves, own transfers, records awaiting review, deleted and archived records out', async () => {
    const accounts = new AccountModule(records.accountRepository, undefined, records.moveRepository);
    await record({ amount: 25000, date: '2026-10-05', description: 'кофе' });
    await record({ amount: 500000, date: '2026-10-05', semanticType: 'own_transfer' });
    await record({ amount: 45000, date: '2026-10-05', needsReview: true });
    await records.repository.delete(await record({ amount: 70000, date: '2026-10-05' }));
    await records.repository.archive(await record({ amount: 80000, date: '2026-10-05' }));
    const [card] = await records.book.listForUser('user-1');
    await db.dataSource.query(`UPDATE accounts SET opening_date = '2026-10-01' WHERE id = ?`, [card.id]);
    const cash = await accounts.getCreateAccountUseCase().execute({
      userId: 'user-1', body: { name: 'Наличные', kind: 'cash', currency: 'UZS', openingDate: '2026-10-01' },
    });
    if (!cash.success) throw cash.error;
    const moved = await accounts.getCreateMoveUseCase().execute({
      userId: 'user-1', body: { kind: 'transfer', fromAccountId: card.id, toAccountId: cash.data.id, amountMinor: sum(300000), date: '2026-10-05' },
    });
    expect(moved.success).toBe(true);

    const result = await month({ month: '2026-10' });
    expect(result.totalMinor).toBe(sum(25000));
    expect(result.categories).toEqual([expect.objectContaining({ name: 'Кафе', amountMinor: sum(25000), count: 1, sharePercent: 100 })]);

    const cafe = await ofCategory('Кафе', { month: '2026-10' });
    expect(cafe.records.map(r => r.description)).toEqual(['кофе']);
    expect(cafe.days.find(day => day.date === '2026-10-05')).toEqual({ date: '2026-10-05', amountMinor: sum(25000), count: 1, hasUsd: false });
  });

  it('converts dollars at the effective rate, marks them «≈», and leaves them out without a rate', async () => {
    const accounts = new AccountModule(records.accountRepository, undefined, records.moveRepository);
    const dollars = await accounts.getCreateAccountUseCase().execute({
      userId: 'user-1', body: { name: 'Доллары', kind: 'cash', currency: 'USD', openingDate: '2026-10-01' },
    });
    if (!dollars.success) throw dollars.error;
    await record({ type: 'income', amount: 12500000, category: 'Зарплата', date: '2026-10-13' });
    await record({ type: 'income', amountMinor: 30000, amount: undefined, currency: 'USD', accountId: dollars.data.id, category: 'Фриланс', date: '2026-10-13' });

    const result = await month({ month: '2026-10', type: 'income' });
    // 300 × 12 650 = 3 795 000 сум
    expect(result.totalMinor).toBe(sum(12500000 + 3795000));
    expect(result.hasUsd).toBe(true);
    expect(result.categories.map(row => [row.name, row.amountMinor, row.hasUsd, row.sharePercent])).toEqual([
      ['Зарплата', sum(12500000), false, 77],
      ['Фриланс', sum(3795000), true, 23],
    ]);
    expect(result.usd).toEqual({ present: true, missingRate: false, rateMinor: 1265000, source: 'cbu' });

    rate = null;
    const noRate = await month({ month: '2026-10', type: 'income' });
    expect(noRate.totalMinor).toBe(sum(12500000));
    expect(noRate.hasUsd).toBe(false);
    expect(noRate.usd).toEqual({ present: true, missingRate: true, rateMinor: null, source: null });

    const expenses = await month({ month: '2026-10', type: 'expense' });
    expect(expenses.usd).toEqual({ present: false, missingRate: false, rateMinor: null, source: null });
  });

  it('counts a record saved before FT-100 with a full moment on its own day', async () => {
    await record({ amount: 10000, date: '2026-10-02' });
    const legacy = await record({ amount: 20000, date: '2026-10-14' });
    await db.dataSource.query(`UPDATE transactions SET date = ? WHERE id = ?`, ['2026-10-14T05:30:00.000Z', legacy]);

    expect((await month({ month: '2026-10' })).totalMinor).toBe(sum(30000));
    expect((await ofCategory('Кафе', { month: '2026-10' })).days.find(day => day.date === '2026-10-14')).toMatchObject({ amountMinor: sum(20000) });
  });

  it('gives no insight and no comparison in the first 7 days of recording', async () => {
    await record({ amount: 30000, date: '2026-10-12' });
    await record({ amount: 40000, date: '2026-10-14', category: 'Продукты' });

    const result = await month({ month: '2026-10' });

    expect(result).toMatchObject({ firstMonth: '2026-10', previous: null, comparable: false });
    expect(result.insight).toEqual({ kind: 'too_early', days: 3, daysLeft: 4 });
    expect(result.categories.map(row => [row.name, row.sharePercent, row.change])).toEqual([['Продукты', 57, null], ['Кафе', 43, null]]);
  });

  it('is empty for a month without records', async () => {
    const result = await month({ month: '2026-10' });
    expect(result).toMatchObject({ firstMonth: '2026-10', totalMinor: 0, categories: [], insight: null, previous: null });
  });

  describe('a category', () => {
    beforeEach(async () => {
      await record({ amount: 30000, date: '2026-09-01' });
      await record({ amount: 50000, date: '2026-09-04' });
      await record({ amount: 120000, date: '2026-10-01', description: 'Пицца' });
      const dinner = await record({ amount: 318000, date: '2026-10-05', description: 'Семейный ужин' });
      const coffee = await record({ amount: 25000, date: '2026-10-05', description: 'Кофе' });
      // SQLite keeps createdAt to the second: the later one is said to be later
      await db.dataSource.query(`UPDATE transactions SET createdAt = '2026-10-05 08:00:00' WHERE id = ?`, [dinner]);
      await db.dataSource.query(`UPDATE transactions SET createdAt = '2026-10-05 09:00:00' WHERE id = ?`, [coffee]);
      await record({ amount: 145000, date: '2026-10-13', description: 'Обед с командой' });
      await record({ amount: 392000, date: '2026-10-05', category: 'Продукты', description: 'Супермаркет' });
    });

    it('sums up the category and compares it like the month', async () => {
      const cafe = await ofCategory('Кафе', { month: '2026-10' });
      expect(cafe).toMatchObject({
        month: '2026-10', today: '2026-10-14', firstMonth: '2026-09',
        category: { id: await categoryId('Кафе'), name: 'Кафе', type: 'expense' },
        period: { from: '2026-10-01', to: '2026-10-14' },
        previous: { from: '2026-09-01', to: '2026-09-14' },
        comparable: true,
        amountMinor: sum(608000),
        count: 4,
        sharePercent: 61,
        hasUsd: false,
        previousMinor: sum(80000),
        change: { kind: 'up', percent: 660, diffMinor: sum(528000) },
      });
    });

    it('spends by day over the whole period', async () => {
      const cafe = await ofCategory('Кафе', { month: '2026-10' });
      expect(cafe.days).toHaveLength(14);
      expect(cafe.days[0]).toEqual({ date: '2026-10-01', amountMinor: sum(120000), count: 1, hasUsd: false });
      expect(cafe.days[4]).toEqual({ date: '2026-10-05', amountMinor: sum(343000), count: 2, hasUsd: false });
      expect(cafe.days[1]).toEqual({ date: '2026-10-02', amountMinor: 0, count: 0, hasUsd: false });

      const september = await ofCategory('Кафе', { month: '2026-09' });
      expect(september.days).toHaveLength(30);
    });

    it('lists its operations newest first', async () => {
      const cafe = await ofCategory('Кафе', { month: '2026-10' });
      expect(cafe.records.map(r => [r.date, r.description])).toEqual([
        ['2026-10-13', 'Обед с командой'],
        ['2026-10-05', 'Кофе'],
        ['2026-10-05', 'Семейный ужин'],
        ['2026-10-01', 'Пицца'],
      ]);
      expect(cafe.records[0]).toMatchObject({ amountMinor: sum(145000), categoryId: await categoryId('Кафе') });
    });

    it('refuses a category that is not the user\'s', async () => {
      const theirs = await categoryId('Кафе', 'user-2');
      const foreign = await categoryAnalytics.execute({ userId: 'user-1', categoryId: theirs, query: {} });
      expect(!foreign.success && (foreign.error as { statusCode?: number }).statusCode).toBe(404);
      const unknown = await categoryAnalytics.execute({ userId: 'user-1', categoryId: 'no-such-category', query: {} });
      expect(!unknown.success && (unknown.error as { statusCode?: number }).statusCode).toBe(404);
    });
  });

  it('refuses a month or a type it cannot read', async () => {
    for (const query of [{ month: '2026-13' }, { month: '2026-1' }, { month: ['2026-10'] }, { month: '2026-11' }, { type: 'debt' }]) {
      const result = await monthAnalytics.execute({ userId: 'user-1', query });
      expect(!result.success && (result.error as { statusCode?: number }).statusCode).toBe(400);
    }
  });

  describe('GET /api/analytics', () => {
    let server: TestServer;

    beforeEach(async () => {
      const userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
      server = await startTestServer({
        '/analytics': createAnalyticsRoutes(monthAnalytics, categoryAnalytics, userModule),
        '/settings': createSettingsRoutes(userModule),
      });
    });

    afterEach(async () => {
      await server.close();
    });

    it('answers the current user\'s analytics and no one else\'s', async () => {
      const userId = (await server.request('GET', '/api/settings', { devUser: 4242 })).body.data.userId;
      await record({ userId, amount: 25000, date: '2026-10-03' });
      await record({ userId: 'someone-else', amount: 99000, date: '2026-10-03' });

      const res = await server.request('GET', '/api/analytics?month=2026-10&type=expense', { devUser: 4242 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ month: '2026-10', totalMinor: sum(25000) });

      const cafe = await server.request('GET', `/api/analytics/categories/${await categoryId('Кафе', userId)}?month=2026-10`, { devUser: 4242 });
      expect(cafe.status).toBe(200);
      expect(cafe.body.data).toMatchObject({ amountMinor: sum(25000), count: 1 });

      const theirs = await categoryId('Кафе', 'someone-else');
      expect((await server.request('GET', `/api/analytics/categories/${theirs}`, { devUser: 4242 })).status).toBe(404);
      expect((await server.request('GET', '/api/analytics?month=2026-10')).status).toBe(401);
      expect((await server.request('GET', '/api/analytics?type=debt', { devUser: 4242 })).status).toBe(400);
    });
  });
});
