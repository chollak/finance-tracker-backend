import { SqliteTransactionRepository } from '../src/modules/transaction/infrastructure/persistence/SqliteTransactionRepository';
import { SqliteCategoryRepository } from '../src/modules/category/infrastructure/SqliteCategoryRepository';
import { CategoryCatalog } from '../src/modules/category/application/categoryCatalog';
import { Category } from '../src/modules/category/domain/category';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';

/** What SqliteTransactionRepository.update writes, on a real SQLite file (FT-087, FT-097, FT-099). */
describe('SqliteTransactionRepository.update', () => {
  let db: TestDatabase;
  let repository: SqliteTransactionRepository;
  let categories: Category[];

  beforeEach(async () => {
    db = await openMigratedDatabase();
    repository = new SqliteTransactionRepository(db.dataSource);
    categories = await new CategoryCatalog(new SqliteCategoryRepository(db.dataSource)).listForUser('user-1');
  });

  afterEach(async () => {
    await db.close();
  });

  const category = (name: string) => categories.find(item => item.name === name && item.type === 'expense')!;

  async function stored() {
    return repository.create({
      userId: 'user-1', amount: 25000, type: 'expense', category: 'Кафе', categoryId: category('Кафе').id,
      description: 'Кофе', date: '2026-10-14',
    });
  }

  it('writes a category change and reads back its name', async () => {
    const tx = await stored();

    const updated = await repository.update(tx.id!, { categoryId: category('Продукты').id });

    expect(updated).toMatchObject({ categoryId: category('Продукты').id, category: 'Продукты' });
  });

  it('writes the category together with other corrected fields', async () => {
    const tx = await stored();

    const updated = await repository.update(tx.id!, { categoryId: category('Продукты').id, amount: 28000, needsReview: false });

    expect(updated).toMatchObject({ category: 'Продукты', amountMinor: 2800000, amount: 28000, needsReview: false });
  });

  it('leaves the category alone when the update does not mention it', async () => {
    const tx = await stored();

    const updated = await repository.update(tx.id!, { description: 'Капучино' });

    expect(updated).toMatchObject({ description: 'Капучино', category: 'Кафе', categoryId: category('Кафе').id });
  });

  it('shows the category under its current name after a rename', async () => {
    const tx = await stored();
    await new SqliteCategoryRepository(db.dataSource).update(category('Кафе').id, { name: 'Рестораны' });

    expect((await repository.findById(tx.id!))?.category).toBe('Рестораны');
  });

  it('refuses to create a record without a resolved category', async () => {
    await expect(repository.create({
      userId: 'user-1', amount: 1, type: 'expense', category: 'Кафе', description: 'x', date: '2026-10-14',
    })).rejects.toThrow(/categoryId/);
  });
});
