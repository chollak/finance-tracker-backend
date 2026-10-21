import { quickAddCategory } from '../src/delivery/messaging/telegram/utils/userCategories';
import { BotContext } from '../src/delivery/messaging/telegram/types';
import { CategoryModule } from '../src/modules/category/categoryModule';
import { SqliteCategoryRepository } from '../src/modules/category/infrastructure/SqliteCategoryRepository';
import { toDateOnly, todayDateOnly } from '../src/shared/domain/dates/dateOnly';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';

describe('bot quick-add buttons of messages sent before FT-124 (FT-100)', () => {
  let db: TestDatabase;
  let ctx: BotContext;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    ctx = { modules: { categoryModule: new CategoryModule(new SqliteCategoryRepository(db.dataSource)) } } as unknown as BotContext;
  });

  afterEach(async () => {
    await db.close();
  });

  it('a button with a category id records into that category', async () => {
    const catalog = (ctx.modules.categoryModule as CategoryModule).getCatalog();
    const cafe = (await catalog.listForUser('user-1')).find(c => c.name === 'Кафе')!;

    expect(await quickAddCategory(ctx, 'user-1', cafe.id)).toEqual({ categoryId: cafe.id, category: 'Кафе', name: 'Кафе' });
  });

  it('a button from a message sent before FT-099 still works through its old id', async () => {
    const picked = await quickAddCategory(ctx, 'user-1', 'taxi');

    expect(picked).toMatchObject({ category: 'Транспорт', name: 'Транспорт' });
    expect(picked.categoryId).toBeDefined();
  });

  it('without the category module the value passes through', async () => {
    const bare = { modules: {} } as unknown as BotContext;
    expect(await quickAddCategory(bare, 'user-1', 'coffee')).toEqual({ category: 'coffee', name: 'coffee' });
  });
});

describe('record dates are the Tashkent calendar day', () => {
  it('keeps a plain date and converts a moment to the day in Tashkent', () => {
    expect(toDateOnly('2026-10-16')).toBe('2026-10-16');
    // 22:30 UTC on the 15th is 03:30 on the 16th in Tashkent (UTC+5)
    expect(toDateOnly('2026-10-15T22:30:00.000Z')).toBe('2026-10-16');
    expect(toDateOnly('2026-10-16T09:00:00.000Z')).toBe('2026-10-16');
    expect(toDateOnly('вчера')).toBe('вчера');
    expect(todayDateOnly(new Date('2026-10-15T20:00:00Z'))).toBe('2026-10-16');
  });
});
