import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { TransactionRepository } from '../src/modules/transaction/domain/transactionRepository';

describe('CreateTransactionUseCase', () => {
  it('saves transaction via repository and returns Result', async () => {
    const transaction: Transaction = {
      date: '2024-01-01',
      category: 'Food',
      description: 'Lunch',
      amount: 10,
      type: 'expense',
      userId: 'user1'
    };

    const create = jest.fn().mockResolvedValue({ ...transaction, id: '1' });
    const repo: TransactionRepository = {
      create,
      getAll: jest.fn(),
      delete: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      update: jest.fn(),
      getByUserIdAndDateRange: jest.fn(),
      archive: jest.fn(),
      unarchive: jest.fn(),
      archiveMultiple: jest.fn(),
      archiveAllByUserId: jest.fn(),
      findArchivedByUserId: jest.fn(),
      findByIdIncludingArchived: jest.fn(),
    } as any;

    const useCase = new CreateTransactionUseCase(repo);
    const result = await useCase.execute(transaction);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('1');
    }
    expect(create).toHaveBeenCalled();
  });

  it('returns failure Result when validation fails', async () => {
    const transaction: Transaction = {
      date: '2024-01-01',
      category: 'Food',
      description: 'Lunch',
      amount: 10,
      type: 'expense',
      userId: '' // empty userId should fail
    };

    const create = jest.fn();
    const repo: TransactionRepository = {
      create,
      getAll: jest.fn(),
      delete: jest.fn(),
    } as any;

    const useCase = new CreateTransactionUseCase(repo);
    const result = await useCase.execute(transaction);

    expect(result.success).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});
