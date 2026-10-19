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
import { CategoryResolver, ResolvedCategory } from '../domain/categoryResolver';
import { AccountResolver, ResolvedAccount } from '../domain/accountResolver';
import { toDateOnly } from '../../../shared/domain/dates/dateOnly';
import { isStoredClientId } from '../domain/clientId';

export interface CreateTransactionOptions {
  /** Automatic paths (AI parser, text fast paths) never write into a hidden category. */
  visibleCategoriesOnly?: boolean;
  /**
   * What the wording said about the account (FT-103): the text to look for account names in, and
   * cash or card.
   */
  accountHint?: { text?: string; kind?: 'cash' | 'card' };
  /**
   * Automatic paths may write an amount whose currency no visible account has («55$» without a dollar
   * account): the record keeps its currency on the default account and is flagged for review. Explicit
   * writers get a validation error instead.
   */
  allowCurrencyMismatch?: boolean;
  /** Told where the record went, for the parse response's assumptions. */
  onResolved?: (resolved: { category?: ResolvedCategory; account?: ResolvedAccount }) => void;
  /**
   * Told when the client already sent this `clientId` (FT-106): nothing is created and the id of the
   * earlier record — possibly deleted — is returned.
   */
  onRepeat?: (existing: Transaction) => void;
}

const logger = getLogger(LogCategory.TRANSACTION);

export class CreateTransactionUseCase {
  private primaryRepository: TransactionRepository;
  private subscriptionModule?: SubscriptionModule;
  private userModule?: UserModule;
  private categoryResolver?: CategoryResolver;
  private accountResolver?: AccountResolver;

  constructor(primaryRepository: TransactionRepository, categoryResolver?: CategoryResolver, accountResolver?: AccountResolver) {
    this.primaryRepository = primaryRepository;
    this.categoryResolver = categoryResolver;
    this.accountResolver = accountResolver;
  }

  /** Wired after modules are created; see createModules(). */
  setAccountResolver(accountResolver: AccountResolver): void {
    this.accountResolver = accountResolver;
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

    // A repeat from the offline queue returns the record it created the first time (FT-106)
    if (transaction.clientId !== undefined) {
      if (!isStoredClientId(transaction.clientId)) {
        return ResultHelper.failure(new ValidationError('clientId must be up to 64 letters, digits or «-»', 'clientId'));
      }
      const repeat = await this.findRepeat(transaction.userId, transaction.clientId);
      if (repeat) {
        options.onRepeat?.(repeat);
        return ResultHelper.success(repeat.id!);
      }
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
    // A full ISO moment (the bot's quick-add sends one) becomes the Tashkent calendar day
    if (transaction.date) transaction.date = toDateOnly(transaction.date);

    // The category: an id from new clients, or an old id / name / alias from old ones (FT-099)
    let resolvedCategory: ResolvedCategory | undefined;
    let resolvedAccount: ResolvedAccount | undefined;
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
      resolvedCategory = resolved.data;
    }

    // The account and the currency (FT-101, FT-103). An amount is in сум unless the writer says
    // otherwise; a picked account brings its own currency.
    if (this.accountResolver) {
      const account = await this.accountResolver.resolveForRecord({
        userId: transaction.userId,
        accountId: transaction.accountId,
        text: options.accountHint?.text,
        kind: options.accountHint?.kind,
        currency: transaction.accountId ? undefined : transaction.currency ?? 'UZS',
      });
      if (!account.success) {
        return ResultHelper.failure(account.error);
      }
      transaction.accountId = account.data.id;
      resolvedAccount = account.data;

      const currency = transaction.currency ?? account.data.currency;
      if (currency !== account.data.currency) {
        if (!options.allowCurrencyMismatch) {
          return ResultHelper.failure(new ValidationError(
            `The amount is in ${currency}, the account «${account.data.name}» is in ${account.data.currency}`,
            'currency'
          ));
        }
        // «55$» without a dollar account: keep the dollars, ask the user to sort it out
        transaction.needsReview = true;
      }
      transaction.currency = currency;
    }
    transaction.currency = transaction.currency ?? 'UZS';
    transaction.source = transaction.source ?? 'manual';
    options.onResolved?.({ category: resolvedCategory, account: resolvedAccount });

    try {
      const created = await this.primaryRepository.create(transaction);
      logger.info('Transaction created', { transactionId: created.id, userId: transaction.userId });

      // Increment usage counter after successful create
      if (this.subscriptionModule && this.userModule && transaction.userId) {
        await this.incrementTransactionCount(transaction.userId);
      }

      return ResultHelper.success(created.id!);
    } catch (error) {
      // Two copies of one request at once: the unique (user, clientId) index lets one in; the other
      // answers with that record — once the first one's write is done, so it is looked for a few times
      if (transaction.clientId && /UNIQUE/i.test((error as Error)?.message ?? '')) {
        for (let attempt = 1; attempt <= 5; attempt += 1) {
          const repeat = await this.findRepeat(transaction.userId, transaction.clientId).catch(() => null);
          if (repeat) {
            options.onRepeat?.(repeat);
            return ResultHelper.success(repeat.id!);
          }
          await new Promise(resolve => setTimeout(resolve, 20 * attempt));
        }
      }
      logger.error('Error creating transaction', error as Error);
      return ResultHelper.failure(
        new BusinessLogicError('Failed to create transaction', { userId: transaction.userId })
      );
    }
  }

  private async findRepeat(userId: string, clientId: string): Promise<Transaction | null> {
    const records = await this.primaryRepository.findByClientId(userId, clientId);
    return records.find(record => record.clientId === clientId) ?? null;
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
