import { CategoryModule } from '../src/modules/category/categoryModule';
import { SqliteCategoryRepository } from '../src/modules/category/infrastructure/SqliteCategoryRepository';
import { createCategoryRoutes } from '../src/modules/category/presentation/categoryController';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { GetTransactionHistoryUseCase } from '../src/modules/transaction/application/getTransactionHistory';
import { GetMonthAnalyticsUseCase } from '../src/modules/transaction/application/getMonthAnalytics';
import { GetCategoryAnalyticsUseCase } from '../src/modules/transaction/application/getCategoryAnalytics';
import { PeriodTotalsService } from '../src/modules/transaction/application/periodTotalsService';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { startTestServer, TestServer } from './helpers/testServer';

/** 14:00 in Tashkent on 14 October 2026. */
const NOW = new Date('2026-10-14T09:00:00Z');

/**
 * FT-127, the «Категории» screen (boards «Категории», «Категория «Кафе»», «Новая категория», «Скрытые категории»):
 * what the screen needs from the server beyond FT-099's list, add, rename, recolour and hide.
 */
describe('categories screen (FT-127)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
  });

  afterEach(async () => {
    await db.close();
  });

  async function record(userId: string, overrides: Partial<Transaction>) {
    const created = await records.create.execute({
      userId, amount: 45000, type: 'expense', category: 'Кафе', description: 'обед', date: '2026-10-10', ...overrides,
    });
    if (!created.success) throw created.error;
    return created.data;
  }

  describe('DELETE /api/categories/:id — «Отменить» right after «Категория добавлена»', () => {
    let server: TestServer;

    beforeEach(async () => {
      const userModule = new UserModule(new SqliteUserRepository(db.dataSource));
      const categoryModule = new CategoryModule(new SqliteCategoryRepository(db.dataSource));
      server = await startTestServer({ '/categories': createCategoryRoutes(categoryModule, userModule) });
    });

    afterEach(async () => {
      await server.close();
    });

    const as = (method: string, url: string, body?: unknown, devUser = 777) => server.request(method, url, { devUser, body });
    const names = async (type = 'expense') => (await as('GET', `/api/categories?type=${type}`)).body.data.map((c: { name: string }) => c.name);

    it('takes back a category just added: it leaves the list and its name is free again', async () => {
      const added = (await as('POST', '/api/categories', { type: 'expense', name: 'Спорт', color: 'sky' })).body.data;

      const deleted = await as('DELETE', `/api/categories/${added.id}`);

      expect(deleted.status).toBe(200);
      expect(deleted.body.data).toEqual({ id: added.id });
      expect(await names()).not.toContain('Спорт');
      expect((await as('POST', '/api/categories', { type: 'expense', name: 'спорт', color: 'mint' })).status).toBe(201);
    });

    it('a category a record went into stays — deleted records count too: such a category is hidden, not deleted', async () => {
      const added = (await as('POST', '/api/categories', { type: 'expense', name: 'Спорт', color: 'sky' })).body.data;
      const usedId = await record(added.userId, { categoryId: added.id, category: undefined });
      await records.repository.delete(usedId);

      const refused = await as('DELETE', `/api/categories/${added.id}`);

      expect(refused.status).toBe(409);
      expect(await names()).toContain('Спорт');
    });

    it('starter categories and «Другое» are never deleted; another user\'s category is not found; a guest is not let in', async () => {
      const list = (await as('GET', '/api/categories?type=expense')).body.data;
      const cafe = list.find((c: { name: string }) => c.name === 'Кафе');
      const other = list.find((c: { isOther: boolean }) => c.isOther);
      const added = (await as('POST', '/api/categories', { type: 'expense', name: 'Спорт', color: 'sky' })).body.data;

      expect((await as('DELETE', `/api/categories/${cafe.id}`)).status).toBe(400);
      expect((await as('DELETE', `/api/categories/${other.id}`)).status).toBe(400);
      expect((await as('DELETE', `/api/categories/${added.id}`, undefined, 888)).status).toBe(404);
      expect((await server.request('DELETE', `/api/categories/${added.id}`)).status).toBe(401);
      expect(await names()).toEqual(expect.arrayContaining(['Кафе', 'Другое', 'Спорт']));
    });
  });

  describe('records of a hidden category stay in the history and the analytics', () => {
    it('hiding «Кафе» keeps its records found, filtered by it, counted in the month and on its own screen', async () => {
      const service = new PeriodTotalsService({ effectiveUsdRate: async () => ({ rateMinor: 1265000, source: 'cbu' as const }) });
      const history = new GetTransactionHistoryUseCase(records.repository, service);
      const month = new GetMonthAnalyticsUseCase(records.repository, service, () => NOW);
      const ofCategory = new GetCategoryAnalyticsUseCase(records.repository, service, records.catalog, () => NOW);
      const categoryModule = new CategoryModule(new SqliteCategoryRepository(db.dataSource));

      await record('user-1', { description: 'обед' });
      await record('user-1', { description: 'кофе', amount: 25000, date: '2026-10-12' });
      await record('user-1', { description: 'хлеб', amount: 8000, category: 'Продукты' });
      const cafe = (await records.catalog.listForUser('user-1')).find(category => category.name === 'Кафе')!;

      const hidden = await categoryModule.getUpdateCategoryUseCase().execute({ userId: 'user-1', categoryId: cafe.id, body: { isHidden: true } });
      expect(hidden.success && hidden.data.isHidden).toBe(true);

      const all = await history.execute({ userId: 'user-1', query: {} });
      if (!all.success) throw all.error;
      expect(all.data.items.map(item => item.description).sort()).toEqual(['кофе', 'обед', 'хлеб']);
      expect(all.data.items.find(item => item.description === 'кофе')).toMatchObject({ categoryId: cafe.id, category: 'Кафе' });

      const onlyCafe = await history.execute({ userId: 'user-1', query: { categoryIds: cafe.id } });
      if (!onlyCafe.success) throw onlyCafe.error;
      expect(onlyCafe.data.items.map(item => item.description).sort()).toEqual(['кофе', 'обед']);

      const october = await month.execute({ userId: 'user-1', query: { month: '2026-10', type: 'expense' } });
      if (!october.success) throw october.error;
      expect(october.data.categories.find(row => row.categoryId === cafe.id)).toMatchObject({ count: 2, amountMinor: 7000000 });
      expect(october.data.totalMinor).toBe(7800000);

      const cafeMonth = await ofCategory.execute({ userId: 'user-1', categoryId: cafe.id, query: { month: '2026-10' } });
      if (!cafeMonth.success) throw cafeMonth.error;
      expect(cafeMonth.data).toMatchObject({ count: 2, amountMinor: 7000000 });
    });
  });
});
