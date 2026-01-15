import { TransactionRepository } from '../domain/transactionRepository';
import { Transaction } from '../domain/transactionEntity';

export class GetArchivedTransactionsUseCase {
  constructor(private repository: TransactionRepository) {}

  async execute(userId: string, limit?: number): Promise<Transaction[]> {
    return this.repository.findArchivedByUserId(userId, limit);
  }
}
