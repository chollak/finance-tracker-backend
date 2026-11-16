import { TransactionRepository } from '../domain/transactionRepository';
import { Transaction } from '../domain/transactionEntity';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, NotFoundError, StorageError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';

const logger = getLogger(LogCategory.TRANSACTION);

export class GetTransactionByIdUseCase {
  constructor(private repository: TransactionRepository) {}

  /** `includeDeleted` is for restoring (FT-105): a deleted record is found too. */
  async execute(id: string, options?: { includeDeleted?: boolean }): Promise<Result<Transaction>> {
    if (!id?.trim()) {
      return ResultHelper.failure(new ValidationError('Transaction ID is required'));
    }

    try {
      const transaction = options?.includeDeleted
        ? await this.repository.findByIdIncludingDeleted(id.trim())
        : await this.repository.findById(id.trim());

      if (!transaction) {
        return ResultHelper.failure(new NotFoundError('Transaction', id));
      }

      return ResultHelper.success(transaction);
    } catch (error) {
      logger.error('Error getting transaction by ID', error as Error, { transactionId: id });
      return ResultHelper.failure(
        new StorageError('Failed to get transaction')
      );
    }
  }
}
