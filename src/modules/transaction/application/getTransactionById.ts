import { TransactionRepository } from '../domain/transactionRepository';
import { Transaction } from '../domain/transactionEntity';
import { ErrorFactory } from '../../../shared/domain/errors/AppError';

export class GetTransactionByIdUseCase {
  constructor(private repository: TransactionRepository) {}

  async execute(id: string): Promise<Transaction> {
    const transaction = await this.repository.findById(id);

    if (!transaction) {
      throw ErrorFactory.notFound('Transaction', id);
    }

    return transaction;
  }
}
