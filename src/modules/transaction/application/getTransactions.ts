import { TransactionRepository } from '../domain/transactionRepository';
import { Transaction } from '../domain/transactionEntity';

export class GetTransactionsUseCase {
  constructor(private repository: TransactionRepository) {}

  async execute(): Promise<Transaction[]> {
    return this.repository.getAll();
  }
}
