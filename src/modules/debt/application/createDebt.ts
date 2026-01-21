import { DebtRepository } from '../domain/debtRepository';
import { DebtEntity, CreateDebtData, DebtType, DebtStatus } from '../domain/debtEntity';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { DebtLimitExceededError } from '../domain/errors';
import { SubscriptionModule } from '../../subscription/subscriptionModule';
import { UserModule } from '../../user/userModule';

// Debt-related category for transactions
const DEBT_CATEGORY = 'debt';

export class CreateDebtUseCase {
  constructor(
    private debtRepository: DebtRepository,
    private createTransactionUseCase: CreateTransactionUseCase,
    private subscriptionModule?: SubscriptionModule,
    private userModule?: UserModule
  ) {}

  async execute(data: CreateDebtData): Promise<Result<DebtEntity>> {
    try {
      const validation = this.validate(data);
      if (!validation.isValid) {
        return ResultHelper.failure(new ValidationError(validation.error!));
      }

      // Check debt limit for free users
      if (this.subscriptionModule && this.userModule) {
        const limitCheckResult = await this.checkDebtLimit(data.userId);
        if (!limitCheckResult.allowed) {
          return ResultHelper.failure(
            new DebtLimitExceededError(limitCheckResult.limit!, limitCheckResult.currentUsage)
          );
        }
      }

      // Create the debt first
      const debt = await this.debtRepository.create(data);

      // If money was actually transferred, create a linked transaction
      if (data.moneyTransferred) {
        await this.createLinkedTransaction(debt, data);
        // Transaction is created and linked via isDebtRelated + relatedDebtId fields
      }

      return ResultHelper.success(debt);
    } catch (error) {
      console.error('Error creating debt:', error);
      return ResultHelper.failure(new BusinessLogicError('Failed to create debt'));
    }
  }

  private async createLinkedTransaction(debt: DebtEntity, data: CreateDebtData): Promise<string> {
    // Determine transaction type based on debt type:
    // - "I owe someone" = I received money from them = income (but it's a debt)
    // - "Someone owes me" = I gave money to them = expense (but it's recoverable)

    const isExpense = data.type === DebtType.OWED_TO_ME; // I gave money

    const description = data.type === DebtType.OWED_TO_ME
      ? `Дал в долг: ${debt.personName}`
      : `Взял в долг у: ${debt.personName}`;

    return this.createTransactionUseCase.execute({
      userId: debt.userId,
      amount: debt.originalAmount,
      type: isExpense ? 'expense' : 'income',
      category: DEBT_CATEGORY,
      description: data.description || description,
      date: new Date().toISOString().split('T')[0],
      isDebtRelated: true,
      relatedDebtId: debt.id
    });
  }

  private validate(data: CreateDebtData): { isValid: boolean; error?: string } {
    if (!data.userId?.trim()) {
      return { isValid: false, error: 'User ID is required' };
    }

    if (!data.personName?.trim()) {
      return { isValid: false, error: 'Person name is required' };
    }

    if (!data.amount || data.amount <= 0) {
      return { isValid: false, error: 'Amount must be greater than 0' };
    }

    if (!data.type || !Object.values(DebtType).includes(data.type)) {
      const validTypes = Object.values(DebtType).join(', ');
      return {
        isValid: false,
        error: `Invalid debt type: "${data.type}". Valid types are: ${validTypes}`,
      };
    }

    return { isValid: true };
  }

  /**
   * Check if user can create a new debt based on their subscription tier
   * Free users: max 5 active debts
   * Premium users: unlimited
   */
  private async checkDebtLimit(telegramId: string): Promise<{
    allowed: boolean;
    currentUsage: number;
    limit: number | null;
  }> {
    try {
      // Resolve telegram_id to UUID
      const user = await this.userModule!.getGetOrCreateUserUseCase().execute({
        telegramId,
      });
      const userId = user.id;

      // Get actual count of active debts from repository
      const activeDebts = await this.debtRepository.getByUserId(userId, DebtStatus.ACTIVE);
      const currentCount = activeDebts.length;

      // Sync the count in usage_limits table
      await this.subscriptionModule!.getSetActiveDebtsCountUseCase().execute({
        userId,
        count: currentCount,
      });

      // Now check the limit (with synced count)
      const limitCheck = await this.subscriptionModule!.getCheckLimitUseCase().execute({
        userId,
        limitType: 'debts',
      });

      return {
        allowed: limitCheck.allowed,
        currentUsage: limitCheck.currentUsage,
        limit: limitCheck.limit,
      };
    } catch (error) {
      console.error('Error checking debt limit:', error);
      // Fail open - allow if we can't check (graceful degradation)
      return { allowed: true, currentUsage: 0, limit: null };
    }
  }
}
