import { TransactionRepository } from '../domain/transactionRepository';
import { Transaction } from '../domain/transactionEntity';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';

const logger = getLogger(LogCategory.TRANSACTION);

export class GetTransactionByIdUseCase {
  constructor(private repository: TransactionRepository) {}

  /** `includeDeleted` is for restoring (FT-105): a deleted record is found, archived or not. */
  async execute(id: string, options?: { includeArchived?: boolean; includeDeleted?: boolean }): Promise<Result<Transaction>> {
    if (!id?.trim()) {
      return ResultHelper.failure(new ValidationError('Transaction ID is required'));
    }

    try {
      const transaction = options?.includeDeleted
        ? await this.repository.findByIdIncludingDeleted(id.trim())
        : options?.includeArchived
          ? await this.repository.findByIdIncludingArchived(id.trim())
          : await this.repository.findById(id.trim());

      if (!transaction) {
        return ResultHelper.failure(new NotFoundError('Transaction', id));
      }

      return ResultHelper.success(transaction);
    } catch (error) {
      logger.error('Error getting transaction by ID', error as Error, { transactionId: id });
      return ResultHelper.failure(
        new BusinessLogicError('Failed to get transaction', { transactionId: id })
      );
    }
  }
}
