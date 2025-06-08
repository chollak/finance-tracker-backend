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
      type: 'expense'
    };

    const save = jest.fn().mockResolvedValue(undefined);
    const repo: TransactionRepository = { save, getAll: jest.fn() };

    const useCase = new CreateTransactionUseCase(repo);
    await useCase.execute(transaction);

    expect(save).toHaveBeenCalledWith(transaction);
  });
});
