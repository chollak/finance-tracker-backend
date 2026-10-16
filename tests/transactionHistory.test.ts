import { createTransactionRouter } from '../src/modules/transaction/presentation/controllers/transactionController';
import { GetTransactionHistoryUseCase } from '../src/modules/transaction/application/getTransactionHistory';
import { GetTransactionByIdUseCase } from '../src/modules/transaction/application/getTransactionById';
import { CategoryModule } from '../src/modules/category/categoryModule';
import { SqliteCategoryRepository } from '../src/modules/category/infrastructure/SqliteCategoryRepository';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { createSettingsRoutes } from '../src/modules/user/presentation/controllers/settingsController';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { startTestServer, TestServer } from './helpers/testServer';

const unused = { execute: jest.fn() } as never;

describe('history with search and filters (FT-107)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;
  let history: GetTransactionHistoryUseCase;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
    history = new GetTransactionHistoryUseCase(records.repository);
  });

  afterEach(async () => {
    await db.close();
  });

  async function record(overrides: Partial<Transaction>) {
    const created = await records.create.execute({
      userId: 'user-1', amount: 10000, type: 'expense', category: 'Покупки', description: 'x', date: '2026-10-16', ...overrides,
    });
    if (!created.success) throw created.error;
    return created.data;
  }

  const search = async (query: Record<string, unknown>, userId = 'user-1') => {
    const result = await history.execute({ userId, query });
    if (!result.success) throw result.error;
    return result.data;
  };
  const descriptions = async (query: Record<string, unknown>) => (await search(query)).items.map(item => item.description);

  it('finds by note and merchant ignoring case and «ё», and by the category name — also after a rename', async () => {
    await record({ description: 'Такси до аэропорта', category: 'Транспорт' });
    await record({ description: 'обед', merchant: 'Ёлки-палки', category: 'Кафе' });
    await record({ description: 'хлеб', category: 'Продукты' });
    await record({ description: 'такси домой', category: 'Транспорт', userId: 'user-2' });

    expect(await descriptions({ q: 'такси' })).toEqual(['Такси до аэропорта']);
    expect(await descriptions({ q: '  ЕЛКИ ' })).toEqual(['обед']);
    expect(await descriptions({ q: 'кафе' })).toEqual(['обед']);
    expect(await descriptions({ q: '%' })).toEqual([]);

    const categories = new CategoryModule(new SqliteCategoryRepository(db.dataSource));
    const cafe = (await records.catalog.listForUser('user-1')).find(category => category.name === 'Кафе')!;
    const renamed = await categories.getUpdateCategoryUseCase().execute({ userId: 'user-1', categoryId: cafe.id, body: { name: 'Рестораны' } });
    expect(renamed.success).toBe(true);
    expect(await descriptions({ q: 'рестор' })).toEqual(['обед']);
    expect(await descriptions({ q: 'кафе' })).toEqual([]);
  });

  it('keeps the search text in step when the note changes', async () => {
    const id = await record({ description: 'кофе', merchant: 'Bon' });
    await records.update.execute({ id, description: 'Капучино' });

    expect(await descriptions({ q: 'капуч' })).toEqual(['Капучино']);
    expect(await descriptions({ q: 'bon' })).toEqual(['Капучино']);
    expect(await descriptions({ q: 'кофе' })).toEqual([]);
  });

  it('filters by category, account, type and dates; leaves deleted and archived records out', async () => {
    await record({ description: 'a', date: '2026-10-01', category: 'Кафе' });
    await record({ description: 'b', date: '2026-10-10', category: 'Транспорт' });
    await record({ description: 'c', date: '2026-10-20', type: 'income', category: 'Зарплата' });
    const deleted = await record({ description: 'd', date: '2026-10-11' });
    const archived = await record({ description: 'e', date: '2026-10-12' });
    await records.repository.delete(deleted);
    await records.repository.archive(archived);
    const categories = await records.catalog.listForUser('user-1');
    const id = (name: string) => categories.find(category => category.name === name)!.id;
    const [card] = await records.book.listForUser('user-1');

    expect(await descriptions({})).toEqual(['c', 'b', 'a']);
    expect(await descriptions({ categoryIds: `${id('Кафе')},${id('Транспорт')}` })).toEqual(['b', 'a']);
    expect(await descriptions({ categoryIds: [id('Кафе')] })).toEqual(['a']);
    expect(await descriptions({ accountIds: card.id })).toEqual(['c', 'b', 'a']);
    expect(await descriptions({ accountIds: 'other' })).toEqual([]);
    expect(await descriptions({ type: 'income' })).toEqual(['c']);
    expect(await descriptions({ from: '2026-10-05', to: '2026-10-15' })).toEqual(['b']);
  });

  it('pages by cursor: by date, then creation time, newest first, with nothing lost or repeated', async () => {
    for (let i = 0; i < 7; i += 1) {
      await record({ description: `r${i}`, date: i < 4 ? '2026-10-16' : '2026-10-15' });
    }
    const pages: string[][] = [];
    let cursor: string | undefined;
    do {
      const page = await search({ limit: '3', ...(cursor ? { cursor } : {}) });
      pages.push(page.items.map(item => item.description));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(pages.map(page => page.length)).toEqual([3, 3, 1]);
    const all = pages.flat();
    expect(new Set(all).size).toBe(7);
    // Newest day first; inside a day, newest first (the same second is broken by id)
    expect(all.slice(0, 4).sort()).toEqual(['r0', 'r1', 'r2', 'r3']);
    expect(all.slice(4).sort()).toEqual(['r4', 'r5', 'r6']);
  });

  it('orders inside a day by creation time', async () => {
    const first = await record({ description: 'earlier' });
    const second = await record({ description: 'later' });
    await db.dataSource.query(`UPDATE transactions SET createdAt = '2026-10-16 08:00:00' WHERE id = ?`, [first]);
    await db.dataSource.query(`UPDATE transactions SET createdAt = '2026-10-16 09:00:00' WHERE id = ?`, [second]);

    const page = await search({ limit: '1' });
    expect(page.items[0].description).toBe('later');
    expect((await search({ limit: '1', cursor: page.nextCursor })).items[0].description).toBe('earlier');
  });

  it('pages through older records whose date keeps a full moment', async () => {
    const legacy = await record({ description: 'old', date: '2026-10-14' });
    await record({ description: 'new', date: '2026-10-15' });
    await record({ description: 'older', date: '2026-10-13' });
    await db.dataSource.query(`UPDATE transactions SET date = '2026-10-14T05:30:00.000Z' WHERE id = ?`, [legacy]);

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await search({ limit: '1', ...(cursor ? { cursor } : {}) });
      seen.push(...page.items.map(item => item.description));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(seen).toEqual(['new', 'old', 'older']);
    expect(await descriptions({ from: '2026-10-14', to: '2026-10-14' })).toEqual(['old']);
  });

  it('refuses what it cannot read', async () => {
    for (const query of [
      { q: 'x'.repeat(101) }, { type: 'transfer' }, { from: '2026-13-01' }, { from: '2026-10-20', to: '2026-10-01' },
      { cursor: 'garbage' }, { limit: '0' }, { limit: '101' }, { limit: '2.5' }, { categoryIds: { a: 1 } },
    ]) {
      const result = await history.execute({ userId: 'user-1', query });
      expect(result.success).toBe(false);
    }
  });

  describe('GET /api/transactions', () => {
    let server: TestServer;

    beforeEach(async () => {
      const userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
      server = await startTestServer({
        '/transactions': createTransactionRouter(
          records.create, history, unused, unused, new GetTransactionByIdUseCase(records.repository),
          unused, records.update, unused, unused, unused, unused, unused, unused, undefined, userModule
        ),
        '/settings': createSettingsRoutes(userModule),
      });
    });

    afterEach(async () => {
      await server.close();
    });

    it('answers the current user\'s history and no one else\'s', async () => {
      const userId = (await server.request('GET', '/api/settings', { devUser: 4242 })).body.data.userId;
      await record({ userId, description: 'мой кофе' });
      await record({ userId: 'someone-else', description: 'чужой кофе' });

      const res = await server.request('GET', `/api/transactions?q=${encodeURIComponent('Кофе')}`, { devUser: 4242 });
      expect(res.status).toBe(200);
      expect(res.body.data.items.map((item: Transaction) => item.description)).toEqual(['мой кофе']);
      expect(res.body.data.nextCursor).toBeNull();

      expect((await server.request('GET', '/api/transactions')).status).toBe(401);
      expect((await server.request('GET', '/api/transactions?type=gift', { devUser: 4242 })).status).toBe(400);
    });
  });
});
