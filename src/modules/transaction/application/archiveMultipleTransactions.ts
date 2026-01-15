import { TransactionRepository } from '../domain/transactionRepository';

export interface ArchiveMultipleResult {
  archived: number;
  failed: string[];
}

export class ArchiveMultipleTransactionsUseCase {
  constructor(private repository: TransactionRepository) {}

  async execute(transactionIds: string[]): Promise<ArchiveMultipleResult> {
    const validIds: string[] = [];
    const failed: string[] = [];

    for (const id of transactionIds) {
      const transaction = await this.repository.findByIdIncludingArchived(id);
      if (transaction && !transaction.isArchived) {
        validIds.push(id);
      } else {
        failed.push(id);
      }
    }

    if (validIds.length > 0) {
      await this.repository.archiveMultiple(validIds);
    }

    return { archived: validIds.length, failed };
  }
}
