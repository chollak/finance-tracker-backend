import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { normalizeSemanticType } from '../domain/transactionSemanticType';
import { normalizeNeedsReview } from '../domain/transactionEntity';
import { SubscriptionModule } from '../../subscription/subscriptionModule';
import { UserModule } from '../../user/userModule';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { Validators } from '../../../shared/application/validation/validators';
import { fromMinor } from '../../../shared/domain/money/money';
import { CategoryResolver } from '../domain/categoryResolver';

export interface CreateTransactionOptions {
  /** Automatic paths (AI parser, text fast paths) never write into a hidden category. */
  visibleCategoriesOnly?: boolean;
}

const logger = getLogger(LogCategory.TRANSACTION);

export class CreateTransactionUseCase {
  private primaryRepository: TransactionRepository;
  private subscriptionModule?: SubscriptionModule;
  private userModule?: UserModule;
  private categoryResolver?: CategoryResolver;

  constructor(primaryRepository: TransactionRepository, categoryResolver?: CategoryResolver) {
    this.primaryRepository = primaryRepository;
    this.categoryResolver = categoryResolver;
  }

  /** Wired after modules are created; see createModules(). */
  setCategoryResolver(categoryResolver: CategoryResolver): void {
    this.categoryResolver = categoryResolver;
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

  async execute(transaction: Transaction, options: CreateTransactionOptions = {}): Promise<Result<string>> {
    // Basic validation
    if (!transaction.userId?.trim()) {
      return ResultHelper.failure(new ValidationError('User ID is required'));
    }

    // Writers send amountMinor (integer minor units) or the legacy amount in сум (FT-097):
    // the bot quick-add, the AI parser, debts and old webapp forms still send `amount`.
    const amountMinor = Validators.moneyAmount(transaction);
    if (!amountMinor.success) {
      return ResultHelper.failure(new ValidationError(amountMinor.error.message, 'amount'));
    }
    transaction.amountMinor = amountMinor.data;
    transaction.amount = fromMinor(amountMinor.data);

    if (!transaction.type || !['income', 'expense'].includes(transaction.type)) {
      return ResultHelper.failure(new ValidationError('Type must be "income" or "expense"'));
    }

    transaction.semanticType = normalizeSemanticType(transaction.semanticType, transaction.type);
    transaction.needsReview = normalizeNeedsReview(transaction.needsReview);

    // The category: an id from new clients, or an old id / name / alias from old ones (FT-099)
    if (this.categoryResolver) {
      const resolved = await this.categoryResolver.resolveForRecord({
        userId: transaction.userId,
        type: transaction.type,
        categoryId: transaction.categoryId,
        category: transaction.category,
        visibleOnly: options.visibleCategoriesOnly,
      });
      if (!resolved.success) {
        return ResultHelper.failure(resolved.error);
      }
      transaction.categoryId = resolved.data.id;
      transaction.category = resolved.data.name;
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
