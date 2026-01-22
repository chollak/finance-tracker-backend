import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';

const logger = getLogger(LogCategory.TRANSACTION);

export interface UpdateTransactionRequest {
  id: string;
  amount?: number;
  category?: string;
  description?: string;
  date?: string;
  type?: 'income' | 'expense';
}

export class UpdateTransactionUseCase {
  constructor(private repository: TransactionRepository) {}

  async execute(request: UpdateTransactionRequest): Promise<Result<Transaction>> {
    const { id, amount, category, description, date, type } = request;

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
      // Check if transaction exists
      const existing = await this.repository.findById(id.trim());
      if (!existing) {
        return ResultHelper.failure(new NotFoundError('Transaction', id));
      }

      const updatedTransaction = await this.repository.update(id.trim(), {
        amount,
        category,
        description,
        date,
        type,
      });

      logger.info('Transaction updated', { transactionId: id });
      return ResultHelper.success(updatedTransaction);
    } catch (error) {
      logger.error('Error updating transaction', error as Error, { transactionId: id });
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
}
