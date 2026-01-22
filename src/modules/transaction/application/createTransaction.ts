import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { SubscriptionModule } from '../../subscription/subscriptionModule';
import { UserModule } from '../../user/userModule';
import { getLogger, LogCategory } from '../../../shared/application/logging';

const logger = getLogger(LogCategory.TRANSACTION);

export class CreateTransactionUseCase {
  private primaryRepository: TransactionRepository;
  private subscriptionModule?: SubscriptionModule;
  private userModule?: UserModule;

  constructor(primaryRepository: TransactionRepository) {
    this.primaryRepository = primaryRepository;
  }

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

  async execute(transaction: Transaction): Promise<Result<string>> {
    // Basic validation
    if (!transaction.userId?.trim()) {
      return ResultHelper.failure(new ValidationError('User ID is required'));
    }

    if (!transaction.amount || transaction.amount <= 0) {
      return ResultHelper.failure(new ValidationError('Amount must be greater than 0'));
    }

    if (!transaction.type || !['income', 'expense'].includes(transaction.type)) {
      return ResultHelper.failure(new ValidationError('Type must be "income" or "expense"'));
    }

    try {
      const created = await this.primaryRepository.create(transaction);
      logger.info('Transaction created', { transactionId: created.id, userId: transaction.userId });

      // Increment usage counter after successful create
      if (this.subscriptionModule && this.userModule && transaction.userId) {
        await this.incrementTransactionCount(transaction.userId);
      }

      return ResultHelper.success(created.id!);
    } catch (error) {
      logger.error('Error creating transaction', error as Error);
      return ResultHelper.failure(
        new BusinessLogicError('Failed to create transaction', { userId: transaction.userId })
      );
    }
  }

  /**
   * Increment transaction count in usage limits
   * Resolves telegramId to UUID if needed
   */
  private async incrementTransactionCount(userId: string): Promise<void> {
    try {
      // Resolve userId to UUID (handles telegramId, UUID, and guest users)
      const user = await this.userModule!.getGetOrCreateUserUseCase().execute({
        telegramId: userId,
      });

      await this.subscriptionModule!.getIncrementUsageUseCase().execute({
        userId: user.id,
        limitType: 'transactions',
      });
    } catch (error) {
      // Log but don't fail the transaction creation
      logger.error('Failed to increment transaction count', error as Error);
    }
  }
}
