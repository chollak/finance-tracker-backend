import { TransactionRepository } from '../domain/transactionRepository';

export class UnarchiveTransactionUseCase {
  constructor(private repository: TransactionRepository) {}

  async execute(transactionId: string): Promise<void> {
    const transaction = await this.repository.findByIdIncludingArchived(transactionId);

    if (!transaction) {
      throw new Error(`Transaction with id ${transactionId} not found`);
    }

    if (!transaction.isArchived) {
      throw new Error(`Transaction ${transactionId} is not archived`);
    }

    await this.repository.unarchive(transactionId);
  }
}
