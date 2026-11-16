import { TransactionRepository } from '../domain/transactionRepository';
import { Transaction } from '../domain/transactionEntity';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, NotFoundError, StorageError } from '../../../shared/domain/errors/AppError';
import { SubscriptionModule } from '../../subscription/subscriptionModule';
import { UserModule } from '../../user/userModule';
import { resolveUserIdToUUID } from '../../../shared/application/helpers/userIdResolver';
import { getLogger, LogCategory } from '../../../shared/application/logging';

const logger = getLogger(LogCategory.TRANSACTION);

export interface DeleteTransactionRequest {
  id: string;
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
      // A record's userId is already a UUID; only an old Telegram id is resolved (FT-171)
      const ownerId = await resolveUserIdToUUID(recordUserId, this.userModule);
      const useCase = direction === 'increment'
        ? this.subscriptionModule.getIncrementUsageUseCase()
        : this.subscriptionModule.getDecrementUsageUseCase();
      await useCase.execute({ userId: ownerId, limitType: 'transactions' });
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

  /**
   * A record already deleted changes nothing (#317): its deletion time and the record counter stay — as a restore of a
   * record that is not deleted. Two deletes of one record, a double /undo or «Отменить» after the Mini App, free one slot.
   * Two at the same moment (the Mini App and the bot, #383) both find the record, but only the delete whose write
   * changed it frees the slot.
   */
  async execute(request: DeleteTransactionRequest): Promise<Result<void>> {
    const id = request.id?.trim();

    if (!id) {
      return ResultHelper.failure(new ValidationError('Transaction ID is required'));
    }

    try {
      const record = await this.repository.findById(id);
      if (!record) {
        const deleted = await this.repository.findByIdIncludingDeleted(id);
        if (!deleted?.deletedAt) return ResultHelper.failure(new NotFoundError('Transaction', id));
        logger.debug('Transaction already deleted; nothing changes', { transactionId: id });
        return ResultHelper.success(undefined);
      }

      if (!(await this.repository.delete(id))) {
        logger.debug('Transaction deleted by another request meanwhile; nothing changes', { transactionId: id });
        return ResultHelper.success(undefined);
      }
      logger.info('Transaction deleted', { transactionId: id });

      // The owner from the record: the counter is theirs (FT-171)
      await this.counter.change(record.userId, 'decrement');

      return ResultHelper.success(undefined);
    } catch (error) {
      logger.error('Error deleting transaction', error as Error, { transactionId: id });
      return ResultHelper.failure(
        new StorageError('Failed to delete transaction')
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
      return ResultHelper.failure(new StorageError('Failed to restore transaction'));
    }
  }
}
