import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { TransactionRepository } from '../src/modules/transaction/domain/transactionRepository';
import { CategoryVectorRepository } from '../src/modules/categoryRecommendation/infrastructure/CategoryVectorRepository';

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
    const categoryRepo: CategoryVectorRepository = { recommendCategory: jest.fn() } as unknown as CategoryVectorRepository;

    const useCase = new CreateTransactionUseCase(repo, categoryRepo);
    await useCase.execute(transaction);

    expect(save).toHaveBeenCalledWith(transaction);
  });

  it('recommends category when uncategorised', async () => {
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
    const recommendCategory = jest.fn().mockResolvedValue({ label: 'Coffee', score: 0.9 });
    const categoryRepo: CategoryVectorRepository = { recommendCategory } as unknown as CategoryVectorRepository;

    const useCase = new CreateTransactionUseCase(repo, categoryRepo);
    await useCase.execute(transaction);

    expect(recommendCategory).toHaveBeenCalledWith('Starbucks latte');
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ category: 'Coffee' }));
  });
});
