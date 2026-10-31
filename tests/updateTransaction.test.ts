import { UpdateTransactionUseCase } from '../src/modules/transaction/application/updateTransaction';
import { UpdateTransactionWithLearningUseCase } from '../src/modules/transaction/application/updateTransactionWithLearning';
import { TransactionRepository } from '../src/modules/transaction/domain/transactionRepository';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { transactionLearning } from '../src/shared/application/learning/transactionLearning';

function buildRepo(existing: Transaction): TransactionRepository {
  return {
    create: jest.fn(),
    getAll: jest.fn(),
    delete: jest.fn(),
    findById: jest.fn().mockResolvedValue(existing),
    findByUserId: jest.fn(),
    update: jest.fn().mockResolvedValue({ ...existing }),
    getByUserIdAndDateRange: jest.fn(),
    archive: jest.fn(),
    unarchive: jest.fn(),
    archiveMultiple: jest.fn(),
    archiveAllByUserId: jest.fn(),
    findArchivedByUserId: jest.fn(),
    findByIdIncludingArchived: jest.fn(),
  } as any;
}

describe('UpdateTransactionUseCase - needsReview', () => {
  const existing: Transaction = {
    id: 'tx-1',
    date: '2024-01-01',
    category: 'Food',
    description: 'Lunch',
    amount: 10,
    type: 'expense',
    userId: 'user1',
  };

  it('passes a valid needsReview boolean through to the repository update', async () => {
    const repo = buildRepo(existing);
    const useCase = new UpdateTransactionUseCase(repo);

    const result = await useCase.execute({ id: 'tx-1', needsReview: true });

    expect(result.success).toBe(true);
    expect(repo.update).toHaveBeenCalledWith('tx-1', expect.objectContaining({ needsReview: true }));
  });

  it('rejects a non-boolean needsReview value', async () => {
    const repo = buildRepo(existing);
    const useCase = new UpdateTransactionUseCase(repo);

    const result = await useCase.execute({ id: 'tx-1', needsReview: 'yes' as any });

    expect(result.success).toBe(false);
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe('UpdateTransactionUseCase - an update that changes nothing (FT-248)', () => {
  const existing: Transaction = {
    id: 'tx-1',
    date: '2026-10-30',
    category: 'Кафе',
    categoryId: 'cat-cafe',
    description: 'кофе',
    amount: 25000,
    amountMinor: 2_500_000,
    type: 'expense',
    semanticType: 'expense',
    needsReview: true,
    userId: 'user1',
  };
  const cafe = { id: 'cat-cafe', name: 'Кафе', type: 'expense' as const, presetKey: 'cafe', isOther: false };
  const resolver = {
    resolveForRecord: jest.fn().mockResolvedValue({ success: true, data: cafe }),
    findForUser: jest.fn(),
  };
  const lessons = () => ({ learnCategory: jest.fn(), unlearnRecord: jest.fn() });

  it('writes nothing, teaches nothing and answers the stored record', async () => {
    const repo = buildRepo(existing);
    const categoryLessons = lessons();
    const useCase = new UpdateTransactionUseCase(repo, resolver, undefined, categoryLessons as any);

    const result = await useCase.execute({
      id: 'tx-1', categoryId: 'cat-cafe', amount: 25000, date: '2026-10-30', description: 'кофе', needsReview: true,
    });

    expect(result).toEqual({ success: true, data: existing });
    expect(repo.update).not.toHaveBeenCalled();
    expect(categoryLessons.unlearnRecord).not.toHaveBeenCalled();
    expect(categoryLessons.learnCategory).not.toHaveBeenCalled();
  });

  it('still refuses an invalid value next to unchanged ones', async () => {
    const repo = buildRepo(existing);
    const useCase = new UpdateTransactionUseCase(repo, resolver);

    const result = await useCase.execute({ id: 'tx-1', categoryId: 'cat-cafe', date: '30.10.2026' });

    expect(result.success).toBe(false);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('writes the whole request when one field is new', async () => {
    const repo = buildRepo(existing);
    const useCase = new UpdateTransactionUseCase(repo, resolver);

    await useCase.execute({ id: 'tx-1', categoryId: 'cat-cafe', description: 'капучино' });

    expect(repo.update).toHaveBeenCalledWith('tx-1', expect.objectContaining({ categoryId: 'cat-cafe', description: 'капучино' }));
  });
});

describe('UpdateTransactionWithLearningUseCase - an update that changes nothing (FT-248)', () => {
  const existing: Transaction = {
    id: 'tx-1',
    date: '2026-10-30',
    category: 'Кафе',
    description: 'кофе',
    amount: 25000,
    amountMinor: 2_500_000,
    type: 'expense',
    semanticType: 'expense',
    merchant: 'Bon',
    userId: 'user1',
  };
  const learningContext = {
    userId: 'user1',
    originalText: 'кофе 25000',
    originalParsing: { amount: 25000, category: 'Кафе', type: 'expense' as const },
  };

  afterEach(() => jest.restoreAllMocks());

  it('writes nothing and records no correction', async () => {
    const recordCorrection = jest.spyOn(transactionLearning, 'recordCorrection').mockResolvedValue();
    const repo = buildRepo(existing);
    const useCase = new UpdateTransactionWithLearningUseCase(repo);

    const result = await useCase.execute({ id: 'tx-1', amount: 25000, merchant: 'Bon', description: 'кофе', ...learningContext });

    expect(result).toEqual({ success: true, data: existing });
    expect(repo.update).not.toHaveBeenCalled();
    expect(recordCorrection).not.toHaveBeenCalled();
  });

  it('writes a new merchant, meaning or «Нужно проверить» next to unchanged fields', async () => {
    jest.spyOn(transactionLearning, 'recordCorrection').mockResolvedValue();
    for (const change of [{ merchant: 'Korzinka' }, { semanticType: 'own_transfer' as const }, { needsReview: true }]) {
      const repo = buildRepo(existing);
      const useCase = new UpdateTransactionWithLearningUseCase(repo);

      await useCase.execute({ id: 'tx-1', amount: 25000, ...change, ...learningContext });

      expect(repo.update).toHaveBeenCalledWith('tx-1', expect.objectContaining(change));
    }
  });
});
