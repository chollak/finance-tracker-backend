import { TransactionRepository } from '../domain/transactionRepository';
import { Transaction } from '../domain/transactionEntity';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { SubscriptionModule } from '../../subscription/subscriptionModule';
import { UserModule } from '../../user/userModule';
import { getLogger, LogCategory } from '../../../shared/application/logging';

const logger = getLogger(LogCategory.TRANSACTION);

export interface DeleteTransactionRequest {
  id: string;
  userId?: string;
}

/**
 * The free-tier record counter follows deletes and restores: a deleted record frees its slot, a
 * restored one takes it again. Never fails the main operation.
 */
class TransactionCounter {
  private subscriptionModule?: SubscriptionModule;
  private userModule?: UserModule;

  set(subscriptionModule: SubscriptionModule, userModule: UserModule): void {
    this.subscriptionModule = subscriptionModule;
    this.userModule = userModule;
  }

  async change(recordUserId: string, direction: 'increment' | 'decrement'): Promise<void> {
    if (!this.subscriptionModule || !this.userModule) return;
    try {
      // Resolve telegram_id to UUID (handles telegramId, UUID and guest users)
      const user = await this.userModule.getGetOrCreateUserUseCase().execute({ telegramId: recordUserId });
      const useCase = direction === 'increment'
        ? this.subscriptionModule.getIncrementUsageUseCase()
        : this.subscriptionModule.getDecrementUsageUseCase();
      await useCase.execute({ userId: user.id, limitType: 'transactions' });
    } catch (error) {
      logger.error(`Error ${direction === 'increment' ? 'incrementing' : 'decrementing'} transaction count`, error as Error);
    }
  }
}

/** Deletes a record softly (FT-105): it leaves every list and total, and `restore` brings it back. */
export class DeleteTransactionUseCase {
  private counter = new TransactionCounter();

  constructor(private repository: TransactionRepository) {}

  /**
   * Set subscription dependencies for usage tracking
   * Called after module initialization to avoid circular dependencies
   */
  setSubscriptionDependencies(subscriptionModule: SubscriptionModule, userModule: UserModule): void {
    this.counter.set(subscriptionModule, userModule);
  }

  async execute(request: DeleteTransactionRequest): Promise<Result<void>> {
    const { id, userId } = request;

    if (!id?.trim()) {
      return ResultHelper.failure(new ValidationError('Transaction ID is required'));
    }

    try {
      // Get transaction to know userId before deletion (for decrementing counter)
      let transactionUserId = userId;
      if (!transactionUserId) {
        const transaction = await this.repository.findById(id.trim());
        if (!transaction) {
          return ResultHelper.failure(new NotFoundError('Transaction', id));
        }
        transactionUserId = transaction.userId;
      }

      await this.repository.delete(id.trim());
      logger.info('Transaction deleted', { transactionId: id });

      if (transactionUserId) await this.counter.change(transactionUserId, 'decrement');

      return ResultHelper.success(undefined);
    } catch (error) {
      logger.error('Error deleting transaction', error as Error, { transactionId: id });
      return ResultHelper.failure(
        new BusinessLogicError('Failed to delete transaction', { transactionId: id })
      );
    }
  }
}

/** «Отменить» after a delete (FT-105). Restoring a record that is not deleted changes nothing. */
export class RestoreTransactionUseCase {
  private counter = new TransactionCounter();

  constructor(private repository: TransactionRepository) {}

  setSubscriptionDependencies(subscriptionModule: SubscriptionModule, userModule: UserModule): void {
    this.counter.set(subscriptionModule, userModule);
  }

  async execute(request: { id: string }): Promise<Result<Transaction>> {
    const id = request.id?.trim();
    if (!id) return ResultHelper.failure(new ValidationError('Transaction ID is required'));

    try {
      const record = await this.repository.findByIdIncludingDeleted(id);
      if (!record) return ResultHelper.failure(new NotFoundError('Transaction', id));
      if (!record.deletedAt) return ResultHelper.success(record);

      const restored = await this.repository.restore(id);
      logger.info('Transaction restored', { transactionId: id });
      await this.counter.change(record.userId, 'increment');
      return ResultHelper.success(restored);
    } catch (error) {
      logger.error('Error restoring transaction', error as Error, { transactionId: id });
      return ResultHelper.failure(new BusinessLogicError('Failed to restore transaction', { transactionId: id }));
    }
  }
}
