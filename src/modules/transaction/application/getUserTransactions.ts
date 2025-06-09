import { TransactionRepository } from '../domain/transactionRepository';
import { Transaction } from '../domain/transactionEntity';

export class GetUserTransactionsUseCase {
  constructor(private repository: TransactionRepository) {}

  async execute(userId: string): Promise<Transaction[]> {
    const all = await this.repository.getAll();
    return all.filter(t => t.userId === userId);
  }
}
