/**
 * The two repository implementations must agree: SQLite is what every local
 * check runs against, Supabase is what users actually hit. A field one of them
 * persists and the other drops is a bug that no amount of local testing sees.
 */

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
  Index: () => () => {},
}));

const store = new Map<string, any>();

// Behaves like the slice of TypeORM's repository this class uses, so the test
// can assert what was persisted rather than which arguments were passed.
let nextId = 100;
const typeOrmRepository = {
  create: (data: any) => ({ ...data }),
  save: async (entity: any) => {
    const row = { id: entity.id ?? `tx-${nextId++}`, createdAt: new Date('2026-08-15'), ...entity };
    store.set(row.id, row);
    return row;
  },
  findOne: async ({ where }: any) => {
    const row = store.get(where.id);
    if (!row) return null;
    if (where.isArchived !== undefined && row.isArchived !== where.isArchived) return null;
    return row;
  },
  update: async (id: string, changes: any) => {
    const row = store.get(id);
    if (row) store.set(id, { ...row, ...changes });
    return { affected: row ? 1 : 0 };
  },
};

jest.mock('../src/shared/infrastructure/database/database.config', () => ({
  initializeDatabase: jest.fn(),
  closeDatabase: jest.fn(),
  AppDataSource: {
    getRepository: () => typeOrmRepository,
  },
}));

import { SqliteTransactionRepository } from '../src/modules/transaction/infrastructure/persistence/SqliteTransactionRepository';

beforeEach(() => {
  store.clear();
  store.set('tx-1', {
    id: 'tx-1',
    amount: 50000,
    type: 'expense',
    semanticType: 'expense',
    needsReview: false,
    description: 'Обед',
    date: '2026-08-14',
    merchant: null,
    confidence: 0.8,
    originalText: null,
    originalParsing: null,
    userId: 'u-1',
    category: 'other',
    isArchived: false,
    createdAt: new Date('2026-08-14T00:00:00.000Z'),
  });
});

describe('SqliteTransactionRepository.create', () => {
  it('persists the debt link', async () => {
    const repository = new SqliteTransactionRepository();

    const created = await repository.create({
      amount: 500000,
      type: 'expense',
      description: 'Дал в долг: Иван',
      date: '2026-08-15',
      category: 'debt',
      userId: 'u-1',
      isDebtRelated: true,
      relatedDebtId: 'debt-9',
    } as any);

    // Analytics excludes debt movements with `!t.isDebtRelated`. If the flag
    // does not survive the round trip, lending money is counted as spending —
    // which the product invariants forbid.
    expect(created.isDebtRelated).toBe(true);
    expect(created.relatedDebtId).toBe('debt-9');
  });
});

describe('SqliteTransactionRepository.update', () => {
  it('persists a corrected category', async () => {
    const repository = new SqliteTransactionRepository();

    const updated = await repository.update('tx-1', { category: 'food' });

    // Correcting the category is the main way a user fixes a wrong guess, and
    // the learning system reads the difference to improve future parsing.
    expect(updated.category).toBe('food');
    expect(store.get('tx-1').category).toBe('food');
  });

  it('persists the other editable fields', async () => {
    const repository = new SqliteTransactionRepository();

    const updated = await repository.update('tx-1', {
      amount: 75000,
      description: 'Ужин',
      semanticType: 'own_transfer',
    });

    expect(updated.amount).toBe(75000);
    expect(updated.description).toBe('Ужин');
    expect(updated.semanticType).toBe('own_transfer');
  });

  it('leaves untouched fields alone', async () => {
    const repository = new SqliteTransactionRepository();

    const updated = await repository.update('tx-1', { category: 'food' });

    expect(updated.amount).toBe(50000);
    expect(updated.description).toBe('Обед');
  });
});
