import { GetUserTransactionsUseCase } from '../src/modules/transaction/application/getUserTransactions';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { TransactionRepository } from '../src/modules/transaction/domain/transactionRepository';

describe('GetUserTransactionsUseCase', () => {
  it('filters transactions by userId', async () => {
    const data: Transaction[] = [
      { date: '2024-01-01', category: 'Food', description: 'Lunch', amount: 10, type: 'expense', userId: 'u1' },
      { date: '2024-01-02', category: 'Books', description: 'Book', amount: 20, type: 'expense', userId: 'u2' }
    ];

    const repo: TransactionRepository = { save: jest.fn(), getAll: jest.fn().mockResolvedValue(data) };

    const useCase = new GetUserTransactionsUseCase(repo);
    const result = await useCase.execute('u1');

    expect(result).toEqual([data[0]]);
  });
});
