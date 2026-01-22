import { TransactionRepository } from '../domain/transactionRepository';
import { Transaction } from '../domain/transactionEntity';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';

const logger = getLogger(LogCategory.TRANSACTION);

export class GetTransactionByIdUseCase {
  constructor(private repository: TransactionRepository) {}

  async execute(id: string): Promise<Result<Transaction>> {
    if (!id?.trim()) {
      return ResultHelper.failure(new ValidationError('Transaction ID is required'));
    }

    try {
      const transaction = await this.repository.findById(id.trim());

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
