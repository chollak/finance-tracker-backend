import { UpdateTransactionUseCase } from '../src/modules/transaction/application/updateTransaction';
import { TransactionRepository } from '../src/modules/transaction/domain/transactionRepository';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';

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
