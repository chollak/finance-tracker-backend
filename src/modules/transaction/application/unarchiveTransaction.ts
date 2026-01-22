import { TransactionRepository } from '../domain/transactionRepository';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { NotFoundError, BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';

const logger = getLogger(LogCategory.TRANSACTION);

export class UnarchiveTransactionUseCase {
  constructor(private repository: TransactionRepository) {}

  async execute(transactionId: string): Promise<Result<void>> {
    try {
      const transaction = await this.repository.findByIdIncludingArchived(transactionId);

      if (!transaction) {
        return ResultHelper.failure(new NotFoundError('Transaction', transactionId));
      }

      if (!transaction.isArchived) {
        return ResultHelper.failure(
          new BusinessLogicError('Transaction is not archived', { transactionId })
        );
      }

      await this.repository.unarchive(transactionId);
      logger.info('Transaction unarchived', { transactionId });

      return ResultHelper.success(undefined);
    } catch (error) {
      logger.error('Error unarchiving transaction', error as Error, { transactionId });
      return ResultHelper.failure(
        new BusinessLogicError('Failed to unarchive transaction', { transactionId })
      );
    }
  }
}
