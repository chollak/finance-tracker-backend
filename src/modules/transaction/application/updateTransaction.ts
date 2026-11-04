import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { TransactionSemanticType } from '../domain/transactionSemanticType';
import { CategoryResolver } from '../domain/categoryResolver';
import { resolveCategoryForUpdate } from './resolveCategoryForUpdate';
import { AccountResolver } from '../domain/accountResolver';
import { resolveAccountForUpdate } from './resolveAccountForUpdate';
import { CategoryLessons } from '../domain/categoryLessons';
import { teachCategoryCorrection } from './teachCategoryCorrection';
import { changesRecord, RecordEdit } from '../domain/recordEdit';
import { fieldsForUpdate } from './fieldsForUpdate';

const logger = getLogger(LogCategory.TRANSACTION);

export interface UpdateTransactionRequest {
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
  /** Checked and trimmed as in POST; `null` clears the note (FT-249, #210). */
  description?: string | null;
  date?: string;
  type?: 'income' | 'expense';
  semanticType?: TransactionSemanticType;
  needsReview?: boolean;
  /** Checked and trimmed as the note; `null`, empty or blank clears the merchant (#210). */
  merchant?: string | null;
}

export class UpdateTransactionUseCase {
  constructor(
    private repository: TransactionRepository,
    private categoryResolver?: CategoryResolver,
    private accountResolver?: AccountResolver,
    private categoryLessons?: CategoryLessons
  ) {}

  async execute(request: UpdateTransactionRequest): Promise<Result<Transaction>> {
    const { id } = request;

    // Validate ID
    if (!id?.trim()) {
      return ResultHelper.failure(new ValidationError('Transaction ID is required'));
    }

    // The same check as the learning update (#229), before the record is read
    const fields = fieldsForUpdate(request);
    if (!fields.success) return ResultHelper.failure(fields.error);

    try {
      // Check if transaction exists
      const existing = await this.repository.findById(id.trim());
      if (!existing) {
        return ResultHelper.failure(new NotFoundError('Transaction', id));
      }

      const categoryResult = await resolveCategoryForUpdate(this.categoryResolver, existing, request);
      if (!categoryResult.success) {
        return ResultHelper.failure(categoryResult.error);
      }

      const moved = await resolveAccountForUpdate(this.accountResolver, existing, request);
      if (!moved.success) return ResultHelper.failure(moved.error);
      const { accountId, currency } = moved.data;

      const edit: RecordEdit = { ...fields.data, categoryId: categoryResult.data?.id, accountId, currency };
      // Nothing changes («?» confirmed with the same category): no write, so updatedAt stays, and nothing to learn
      if (!changesRecord(existing, edit)) {
        logger.debug('Transaction update changes nothing', { transactionId: id });
        return ResultHelper.success(existing);
      }

      const updatedTransaction = await this.repository.update(id.trim(), edit);
      const { repository, categoryResolver, accountResolver, categoryLessons } = this;
      await teachCategoryCorrection(
        { repository, categoryResolver, accountResolver, categoryLessons }, existing, request, categoryResult.data
      );

      logger.info('Transaction updated', { transactionId: id });
      return ResultHelper.success(updatedTransaction);
    } catch (error) {
      logger.error('Error updating transaction', error as Error, { transactionId: id });
      return ResultHelper.failure(
        new BusinessLogicError('Failed to update transaction', { transactionId: id })
      );
    }
  }
}
