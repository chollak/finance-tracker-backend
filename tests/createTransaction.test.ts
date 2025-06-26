import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { TransactionRepository } from '../src/modules/transaction/domain/transactionRepository';
import { CategoryVectorRepository } from '../src/modules/transaction/domain/categoryVectorRepository';

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

    const save = jest.fn().mockResolvedValue(undefined);
    const repo: TransactionRepository = { save, getAll: jest.fn() };
    const vectorRepo: CategoryVectorRepository = { recommendCategory: jest.fn() };

    const useCase = new CreateTransactionUseCase(repo, vectorRepo);
    await useCase.execute(transaction);

    expect(save).toHaveBeenCalledWith(transaction);
  });

  it('overwrites uncategorised with recommended category', async () => {
    const transaction: Transaction = {
      date: '2024-01-01',
      category: 'uncategorised',
      description: 'Starbucks latte',
      amount: 5,
      type: 'expense',
      userId: 'user1'
    };

    const save = jest.fn().mockResolvedValue(undefined);
    const repo: TransactionRepository = { save, getAll: jest.fn() };
    const vectorRepo: CategoryVectorRepository = {
      recommendCategory: jest.fn().mockResolvedValue({ category: 'Coffee', score: 0.9 })
    };

    const useCase = new CreateTransactionUseCase(repo, vectorRepo);
    await useCase.execute(transaction);

    expect(vectorRepo.recommendCategory).toHaveBeenCalledWith('Starbucks latte');
    expect(save).toHaveBeenCalledWith({ ...transaction, category: 'Coffee' });
  });
});
