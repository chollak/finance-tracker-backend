import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { transactionLearning } from '../../../shared/application/learning/transactionLearning';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { Validators } from '../../../shared/application/validation/validators';
import { fromMinor, minorOf } from '../../../shared/domain/money/money';
import { CategoryResolver, ResolvedCategory } from '../domain/categoryResolver';
import { resolveCategoryForUpdate } from './resolveCategoryForUpdate';
import { AccountResolver } from '../domain/accountResolver';
import { resolveAccountForUpdate } from './resolveAccountForUpdate';
import { changesRecord, RecordEdit } from '../domain/recordEdit';
import { TransactionSemanticType } from '../domain/transactionSemanticType';

const logger = getLogger(LogCategory.LEARNING);

export interface UpdateTransactionWithLearningRequest {
  id: string;
  /** Legacy amount in сум; converted to amountMinor (FT-097). */
  amount?: number;
  amountMinor?: number;
  /** Legacy: old id, name or alias; resolved to categoryId (FT-099). */
  category?: string;
  categoryId?: string;
  /** Move the record to another of the user's visible accounts (FT-101). */
  accountId?: string;
  /** Only together with accountId: the record's currency must be the new account's (FT-103). */
  currency?: 'UZS' | 'USD';
  description?: string;
  date?: string;
  type?: 'income' | 'expense';
  /** The controller passes every allowed field on, and `...request` writes these two as well. */
  semanticType?: TransactionSemanticType;
  needsReview?: boolean;
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
  constructor(
    private repository: TransactionRepository,
    private categoryResolver?: CategoryResolver,
    private accountResolver?: AccountResolver
  ) {}

  async execute(request: UpdateTransactionWithLearningRequest): Promise<Result<Transaction>> {
    const { id, category, date, type } = request;

    // Validate ID
    if (!id?.trim()) {
      return ResultHelper.failure(new ValidationError('Transaction ID is required'));
    }

    // Validate update fields if provided
    let amountMinor: number | undefined;
    if (request.amount !== undefined || request.amountMinor !== undefined) {
      const resolved = Validators.moneyAmount(request);
      if (!resolved.success) {
        return ResultHelper.failure(new ValidationError(resolved.error.message, 'amount'));
      }
      amountMinor = resolved.data;
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

      const categoryResult = await resolveCategoryForUpdate(this.categoryResolver, originalTransaction, request);
      if (!categoryResult.success) {
        return ResultHelper.failure(categoryResult.error);
      }

      const moved = await resolveAccountForUpdate(this.accountResolver, originalTransaction, request);
      if (!moved.success) return ResultHelper.failure(moved.error);
      const { accountId, currency } = moved.data;

      const edit: RecordEdit = {
        amountMinor,
        categoryId: categoryResult.data?.id,
        accountId,
        currency,
        description: request.description,
        date,
        type,
        semanticType: request.semanticType,
        needsReview: request.needsReview,
        merchant: request.merchant,
      };
      // Nothing changes: no write, so updatedAt stays (FT-248), and no correction to record
      if (!changesRecord(originalTransaction, edit)) {
        logger.debug('Transaction update changes nothing', { transactionId: id });
        return ResultHelper.success(originalTransaction);
      }

      // Update the transaction
      const updatedTransaction = await this.repository.update(id.trim(), {
        ...request,
        amount: undefined,
        amountMinor,
        category: undefined,
        categoryId: categoryResult.data?.id,
        accountId,
        currency,
      });

      // Record learning data if we have the necessary context
      if (request.userId && request.originalText && request.originalParsing) {
        await this.recordLearningData(request, amountMinor, categoryResult.data, originalTransaction, updatedTransaction);
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
    amountMinor: number | undefined,
    category: ResolvedCategory | undefined,
    originalTransaction: Transaction,
    _updatedTransaction: Transaction
  ): Promise<void> {
    try {
      const userCorrection: Record<string, unknown> = {};

      // Detect what the user changed
      // Learning data keeps amounts in сум, like the parser output it corrects
      if (amountMinor !== undefined && amountMinor !== minorOf(originalTransaction)) {
        userCorrection.amount = fromMinor(amountMinor);
      }

      // Learned patterns are shared by all users, so they keep the starter key — stable across renames.
      // A move into a user's own category teaches nothing global.
      if (category && category.id !== originalTransaction.categoryId && category.presetKey) {
        userCorrection.category = category.presetKey;
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
