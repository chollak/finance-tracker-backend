import { TransactionRepository } from '../domain/transactionRepository';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { SubscriptionModule } from '../../subscription/subscriptionModule';
import { UserModule } from '../../user/userModule';
import { createLogger, LogCategory } from '../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TRANSACTION);

export interface DeleteTransactionRequest {
  id: string;
  userId?: string;
}

export class DeleteTransactionUseCase {
  private subscriptionModule?: SubscriptionModule;
  private userModule?: UserModule;

  constructor(private repository: TransactionRepository) {}

  /**
   * Set subscription dependencies for usage tracking
   * Called after module initialization to avoid circular dependencies
   */
  setSubscriptionDependencies(
    subscriptionModule: SubscriptionModule,
    userModule: UserModule
  ): void {
    this.subscriptionModule = subscriptionModule;
    this.userModule = userModule;
  }

  async execute(request: DeleteTransactionRequest): Promise<Result<void>> {
    const { id, userId } = request;

    // Validate input
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

      // Decrement usage counter after successful deletion
      if (transactionUserId && this.subscriptionModule && this.userModule) {
        await this.decrementTransactionCount(transactionUserId);
      }

      return ResultHelper.success(undefined);
    } catch (error) {
      logger.error('Error deleting transaction', error as Error, { transactionId: id });
      return ResultHelper.failure(
        new BusinessLogicError('Failed to delete transaction', { transactionId: id })
      );
    }
  }

  /**
   * Decrement transaction counter for user
   */
  private async decrementTransactionCount(telegramId: string): Promise<void> {
    try {
      // Resolve telegram_id to UUID
      const user = await this.userModule!.getGetOrCreateUserUseCase().execute({
        telegramId,
      });
      const userId = user.id;

      // Decrement counter (fire and forget - don't fail the main operation)
      await this.subscriptionModule!.getDecrementUsageUseCase().execute({
        userId,
        limitType: 'transactions',
      });
    } catch (error) {
      // Non-critical error - log but don't fail the deletion
      logger.error('Error decrementing transaction count', error as Error);
    }
  }
}
