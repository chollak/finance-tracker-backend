import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { TransactionRepository } from '../src/modules/transaction/domain/transactionRepository';

describe('CreateTransactionUseCase', () => {
  it('saves transaction via repository', async () => {
    const transaction: Transaction = {
      date: '2024-01-01',
      category: 'Food',
      description: 'Lunch',
      amount: 10,
      type: 'expense',
      userId: 'user1'
    };

    const save = jest.fn().mockResolvedValue('1');
    const repo: TransactionRepository = { save, getAll: jest.fn(), delete: jest.fn() } as any;

    const useCase = new CreateTransactionUseCase(repo);
    const id = await useCase.execute(transaction);

    expect(save).toHaveBeenCalledWith(transaction);
    expect(id).toBe('1');
  });
});
