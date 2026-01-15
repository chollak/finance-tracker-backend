import { TransactionRepository } from '../domain/transactionRepository';

export interface ArchiveAllResult {
  archivedCount: number;
}

export class ArchiveAllByUserUseCase {
  constructor(private repository: TransactionRepository) {}

  async execute(userId: string): Promise<ArchiveAllResult> {
    const archivedCount = await this.repository.archiveAllByUserId(userId);
    return { archivedCount };
  }
}
