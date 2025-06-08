import { GetTransactionsUseCase } from '../src/modules/transaction/application/getTransactions';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { TransactionRepository } from '../src/modules/transaction/domain/transactionRepository';

describe('GetTransactionsUseCase', () => {
  it('returns data from repository', async () => {
    const data: Transaction[] = [
      { date: '2024-01-01', category: 'Food', description: 'Lunch', amount: 10, type: 'expense', userId: 'user1' }
    ];

    const repo: TransactionRepository = { save: jest.fn(), getAll: jest.fn().mockResolvedValue(data) };

    const useCase = new GetTransactionsUseCase(repo);
    const result = await useCase.execute();

    expect(result).toBe(data);
  });
});
