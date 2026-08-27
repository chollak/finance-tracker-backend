/**
 * The Supabase repositories run in production and have never had a test.
 * Every check so far went through SQLite, so a divergence between the two
 * would be a bug nobody could see from here.
 *
 * These tests do not need a live database: they assert the query the
 * repository builds and the shape it maps in both directions, which is where
 * the two implementations can silently disagree.
 */

const queryLog: Array<[string, ...unknown[]]> = [];
let nextResult: { data: unknown; error: unknown } = { data: null, error: null };

function builder(): any {
  const record = (name: string) => (...args: unknown[]) => {
    queryLog.push([name, ...args]);
    return chain;
  };

  const chain: any = {
    from: record('from'),
    select: record('select'),
    insert: record('insert'),
    update: record('update'),
    delete: record('delete'),
    eq: record('eq'),
    neq: record('neq'),
    gte: record('gte'),
    lte: record('lte'),
    in: record('in'),
    order: record('order'),
    limit: record('limit'),
    single: () => {
      queryLog.push(['single']);
      return Promise.resolve(nextResult);
    },
    // Supabase query builders are thenable; awaiting one runs the query.
    then: (resolve: any, reject: any) => Promise.resolve(nextResult).then(resolve, reject),
  };

  return chain;
}

jest.mock('../src/shared/infrastructure/database/supabase.config', () => ({
  getSupabaseClient: () => builder(),
}));

import { SupabaseTransactionRepository } from '../src/modules/transaction/infrastructure/persistence/SupabaseTransactionRepository';

const ROW = {
  id: 'tx-1',
  amount: '25000',
  type: 'expense',
  semantic_type: 'own_transfer',
  needs_review: true,
  description: 'Перевод себе',
  date: '2026-08-14',
  merchant: null,
  confidence: 0.6,
  original_text: null,
  original_parsing: null,
  user_id: 'u-1',
  category: 'transfer',
  is_archived: false,
  created_at: '2026-08-14T00:00:00.000Z',
  updated_at: '2026-08-14T00:00:00.000Z',
};

function callsOf(name: string) {
  return queryLog.filter(([called]) => called === name);
}

beforeEach(() => {
  queryLog.length = 0;
  nextResult = { data: null, error: null };
});

describe('SupabaseTransactionRepository column mapping', () => {
  it('writes the semantic columns Supabase actually has', async () => {
    nextResult = { data: ROW, error: null };
    const repository = new SupabaseTransactionRepository();

    await repository.create({
      amount: 25000,
      type: 'expense',
      semanticType: 'own_transfer',
      needsReview: true,
      description: 'Перевод себе',
      date: '2026-08-14',
      category: 'transfer',
      userId: 'u-1',
    } as any);

    const [, inserted] = callsOf('insert')[0] as [string, Record<string, unknown>];
    expect(inserted.semantic_type).toBe('own_transfer');
    expect(inserted.needs_review).toBe(true);
    expect(inserted.user_id).toBe('u-1');
    expect(inserted.is_archived).toBe(false);
    expect(inserted).not.toHaveProperty('semanticType');
    expect(inserted).not.toHaveProperty('userId');
  });

  it('пишет канал захвата в ту же колонку, что и SQLite', async () => {
    nextResult = { data: { ...ROW, source: 'shortcut' }, error: null };
    const repository = new SupabaseTransactionRepository();

    await repository.create({
      amount: 18000,
      type: 'expense',
      description: 'Такси',
      date: '2026-08-27',
      category: 'taxi',
      userId: 'u-1',
      source: 'shortcut',
    } as any);

    const [, inserted] = callsOf('insert')[0] as [string, Record<string, unknown>];
    // Колонку добавляет migrations/009_add_transaction_source.sql. Пока она
    // не применена, вставка в Supabase упадёт — это записано в самой миграции.
    expect(inserted.source).toBe('shortcut');
  });

  it('читает канал захвата обратно в доменную форму', async () => {
    nextResult = { data: { ...ROW, source: 'webapp' }, error: null };
    const repository = new SupabaseTransactionRepository();

    const found = await repository.findById('tx-1');

    expect(found!.source).toBe('webapp');
  });

  it('оставляет source пустым у строк, созданных до появления колонки', async () => {
    nextResult = { data: ROW, error: null };
    const repository = new SupabaseTransactionRepository();

    const found = await repository.findById('tx-1');

    expect(found!.source).toBeUndefined();
  });

  it('writes the debt link both repositories are expected to keep', async () => {
    nextResult = { data: ROW, error: null };
    const repository = new SupabaseTransactionRepository();

    await repository.create({
      amount: 500000,
      type: 'expense',
      description: 'Дал в долг: Иван',
      date: '2026-08-15',
      category: 'debt',
      userId: 'u-1',
      isDebtRelated: true,
      relatedDebtId: 'debt-9',
    } as any);

    const [, inserted] = callsOf('insert')[0] as [string, Record<string, unknown>];
    expect(inserted.is_debt_related).toBe(true);
    expect(inserted.related_debt_id).toBe('debt-9');
  });

  it('reads the debt link back', async () => {
    nextResult = { data: { ...ROW, is_debt_related: true, related_debt_id: 'debt-9' }, error: null };
    const repository = new SupabaseTransactionRepository();

    const transaction = await repository.findById('tx-1');

    expect(transaction!.isDebtRelated).toBe(true);
    expect(transaction!.relatedDebtId).toBe('debt-9');
  });

  it('reads the semantic columns back into the domain shape', async () => {
    nextResult = { data: ROW, error: null };
    const repository = new SupabaseTransactionRepository();

    const transaction = await repository.findById('tx-1');

    expect(transaction).not.toBeNull();
    expect(transaction!.semanticType).toBe('own_transfer');
    expect(transaction!.needsReview).toBe(true);
    expect(transaction!.userId).toBe('u-1');
    expect(transaction!.amount).toBe(25000);
  });

  it('defaults a missing semantic type from the direction, as SQLite does', async () => {
    nextResult = { data: { ...ROW, semantic_type: null, needs_review: null, type: 'income' }, error: null };
    const repository = new SupabaseTransactionRepository();

    const transaction = await repository.findById('tx-1');

    expect(transaction!.semanticType).toBe('income');
    expect(transaction!.needsReview).toBe(false);
  });
});

describe('SupabaseTransactionRepository archive filtering', () => {
  it('hides archived rows from the ordinary lookup', async () => {
    nextResult = { data: ROW, error: null };
    const repository = new SupabaseTransactionRepository();

    await repository.findById('tx-1');

    expect(callsOf('eq')).toContainEqual(['eq', 'is_archived', false]);
  });

  it('does not hide them from the lookup that exists to find them', async () => {
    nextResult = { data: ROW, error: null };
    const repository = new SupabaseTransactionRepository();

    await repository.findByIdIncludingArchived('tx-1');

    // The unarchive path depends on this: filtering here is what made
    // restoring impossible on SQLite (FT-066).
    expect(callsOf('eq')).not.toContainEqual(['eq', 'is_archived', false]);
    expect(callsOf('eq')).toContainEqual(['eq', 'id', 'tx-1']);
  });

  it('asks only for archived rows when listing the archive', async () => {
    nextResult = { data: [ROW], error: null };
    const repository = new SupabaseTransactionRepository();

    await repository.findArchivedByUserId('u-1');

    expect(callsOf('eq')).toContainEqual(['eq', 'is_archived', true]);
  });

  it('restores a row by clearing the flag rather than deleting it', async () => {
    nextResult = { data: ROW, error: null };
    const repository = new SupabaseTransactionRepository();

    await repository.unarchive('tx-1');

    const [, updated] = callsOf('update')[0] as [string, Record<string, unknown>];
    expect(updated.is_archived).toBe(false);
    expect(callsOf('delete')).toHaveLength(0);
  });
});

describe('SupabaseTransactionRepository failure handling', () => {
  it('does not pass a database error off as a missing row', async () => {
    nextResult = { data: null, error: { message: 'connection refused' } };
    const repository = new SupabaseTransactionRepository();

    await expect(repository.create({ amount: 1, type: 'expense', description: 'x', date: '2026-08-14', category: 'other', userId: 'u-1' } as any))
      .rejects.toThrow(/connection refused/);
  });
});
