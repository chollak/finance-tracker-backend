import { SqliteTransactionRepository } from '../src/modules/transaction/infrastructure/persistence/SqliteTransactionRepository';
import { AppDataSource } from '../src/shared/infrastructure/database/database.config';

// TypeORM decorators and the data source are replaced so the repository can be exercised
// without a native sqlite3 binding: the test checks what the repository asks TypeORM to write.
jest.mock('typeorm', () => ({
  DataSource: jest.fn(),
  Entity: () => () => {},
  PrimaryGeneratedColumn: () => () => {},
  Column: () => () => {},
  CreateDateColumn: () => () => {},
  UpdateDateColumn: () => () => {},
  ManyToOne: () => () => {},
  OneToMany: () => () => {},
  JoinColumn: () => () => {},
}));

jest.mock('../src/shared/infrastructure/database/database.config', () => ({
  AppDataSource: {
    getRepository: jest.fn(),
  },
}));

describe('SqliteTransactionRepository.update', () => {
  function setup(stored: Record<string, unknown>) {
    const update = jest.fn().mockResolvedValue(undefined);
    const findOne = jest.fn().mockResolvedValue(stored);
    (AppDataSource.getRepository as jest.Mock).mockReturnValue({ update, findOne });
    return { repository: new SqliteTransactionRepository(), update };
  }

  const stored = {
    id: 'tx-1',
    amount: '25000',
    type: 'expense',
    semanticType: 'expense',
    needsReview: false,
    description: 'Кофе',
    date: '2026-10-14',
    userId: 'user-1',
    category: 'coffee',
    isArchived: false,
    createdAt: new Date('2026-10-14T09:00:00Z'),
  };

  it('writes a category change', async () => {
    const { repository, update } = setup(stored);

    await repository.update('tx-1', { category: 'groceries' });

    expect(update).toHaveBeenCalledWith('tx-1', { category: 'groceries' });
  });

  it('writes the category together with other corrected fields', async () => {
    const { repository, update } = setup(stored);

    await repository.update('tx-1', { category: 'groceries', amount: 28000, needsReview: false });

    expect(update).toHaveBeenCalledWith('tx-1', {
      category: 'groceries',
      amount: 28000,
      needsReview: false,
    });
  });

  it('leaves the category alone when the update does not mention it', async () => {
    const { repository, update } = setup(stored);

    await repository.update('tx-1', { description: 'Капучино' });

    expect(update).toHaveBeenCalledWith('tx-1', { description: 'Капучино' });
  });
});
