import { TransactionRepository } from '../domain/transactionRepository';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { NotFoundError, BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { createLogger, LogCategory } from '../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TRANSACTION);

export class ArchiveTransactionUseCase {
  constructor(private repository: TransactionRepository) {}

  async execute(transactionId: string): Promise<Result<void>> {
    try {
      const transaction = await this.repository.findByIdIncludingArchived(transactionId);

      if (!transaction) {
        return ResultHelper.failure(new NotFoundError('Transaction', transactionId));
      }

      if (transaction.isArchived) {
        return ResultHelper.failure(
          new BusinessLogicError('Transaction is already archived', { transactionId })
        );
      }

      await this.repository.archive(transactionId);
      logger.info('Transaction archived', { transactionId });

      return ResultHelper.success(undefined);
    } catch (error) {
      logger.error('Error archiving transaction', error as Error, { transactionId });
      return ResultHelper.failure(
        new BusinessLogicError('Failed to archive transaction', { transactionId })
      );
    }
  }
}
