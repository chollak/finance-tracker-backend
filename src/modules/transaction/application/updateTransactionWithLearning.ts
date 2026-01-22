import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { transactionLearning } from '../../../shared/application/learning/transactionLearning';
import { createLogger, LogCategory } from '../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.LEARNING);

export interface UpdateTransactionWithLearningRequest {
  id: string;
  amount?: number;
  category?: string;
  description?: string;
  date?: string;
  type?: 'income' | 'expense';
  merchant?: string;
  // Learning context
  userId?: string;
  originalText?: string;
  originalParsing?: {
    amount: number;
    category: string;
    type: 'income' | 'expense';
    merchant?: string;
    confidence?: number;
  };
}

export class UpdateTransactionWithLearningUseCase {
  constructor(private repository: TransactionRepository) {}

  async execute(request: UpdateTransactionWithLearningRequest): Promise<Result<Transaction>> {
    const { id, amount, category, date, type } = request;

    // Validate ID
    if (!id?.trim()) {
      return ResultHelper.failure(new ValidationError('Transaction ID is required'));
    }

    // Validate update fields if provided
    if (amount !== undefined && amount <= 0) {
      return ResultHelper.failure(new ValidationError('Amount must be greater than 0'));
    }

    if (category !== undefined && !category.trim()) {
      return ResultHelper.failure(new ValidationError('Category cannot be empty'));
    }

    if (date !== undefined && !this.isValidDateString(date)) {
      return ResultHelper.failure(new ValidationError('Invalid date format. Use YYYY-MM-DD'));
    }

    if (type !== undefined && !['income', 'expense'].includes(type)) {
      return ResultHelper.failure(new ValidationError('Type must be "income" or "expense"'));
    }

    try {
      // Get original transaction for comparison
      const originalTransaction = await this.repository.findById(id.trim());
      if (!originalTransaction) {
        return ResultHelper.failure(new NotFoundError('Transaction', id));
      }

      // Update the transaction
      const updatedTransaction = await this.repository.update(id.trim(), request);

      // Record learning data if we have the necessary context
      if (request.userId && request.originalText && request.originalParsing) {
        await this.recordLearningData(request, originalTransaction, updatedTransaction);
      }

      logger.info('Transaction updated with learning', { transactionId: id });
      return ResultHelper.success(updatedTransaction);
    } catch (error) {
      logger.error('Error updating transaction with learning', error as Error, { transactionId: id });
      return ResultHelper.failure(
        new BusinessLogicError('Failed to update transaction', { transactionId: id })
      );
    }
  }

  private isValidDateString(date: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(date)) return false;
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
  }

  private async recordLearningData(
    request: UpdateTransactionWithLearningRequest,
    originalTransaction: Transaction,
    _updatedTransaction: Transaction
  ): Promise<void> {
    try {
      const userCorrection: Record<string, unknown> = {};

      // Detect what the user changed
      if (request.amount !== undefined && request.amount !== originalTransaction.amount) {
        userCorrection.amount = request.amount;
      }

      if (request.category !== undefined && request.category !== originalTransaction.category) {
        userCorrection.category = request.category;
      }

      if (request.type !== undefined && request.type !== originalTransaction.type) {
        userCorrection.type = request.type;
      }

      if (
        request.merchant !== undefined &&
        request.merchant !== (originalTransaction as { merchant?: string }).merchant
      ) {
        userCorrection.merchant = request.merchant;
      }

      // Only record if there are actual corrections
      if (Object.keys(userCorrection).length > 0) {
        await transactionLearning.recordCorrection(
          request.originalText!,
          request.originalParsing!,
          userCorrection,
          request.userId!,
          request.originalParsing!.confidence || 0.8
        );

        logger.info('Learning recorded for transaction update', {
          transactionId: request.id,
          corrections: Object.keys(userCorrection),
          userId: request.userId?.substring(0, 8),
        });
      }
    } catch (error) {
      logger.error('Failed to record learning data', error as Error);
      // Don't throw - learning failure shouldn't break transaction updates
    }
  }
}
