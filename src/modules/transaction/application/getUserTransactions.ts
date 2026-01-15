import { TransactionRepository } from '../domain/transactionRepository';
import { Transaction } from '../domain/transactionEntity';

export class GetUserTransactionsUseCase {
  constructor(private repository: TransactionRepository) {}

  async execute(userId: string): Promise<Transaction[]> {
    return this.repository.findByUserId(userId);
  }
}
