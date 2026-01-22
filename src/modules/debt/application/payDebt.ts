import { DebtRepository } from '../domain/debtRepository';
import { DebtPaymentEntity, PayDebtData, DebtStatus, DebtType } from '../domain/debtEntity';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, BusinessLogicError, NotFoundError } from '../../../shared/domain/errors/AppError';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { SubscriptionModule } from '../../subscription/subscriptionModule';
import { UserModule } from '../../user/userModule';
import { isUUID } from '../../../shared/application/helpers/userIdResolver';
import { getLogger, LogCategory } from '../../../shared/application/logging';

const logger = getLogger(LogCategory.DEBT);

// Debt-related category for transactions
const DEBT_CATEGORY = 'debt';

export class PayDebtUseCase {
  constructor(
    private debtRepository: DebtRepository,
    private createTransactionUseCase: CreateTransactionUseCase,
    private subscriptionModule?: SubscriptionModule,
    private userModule?: UserModule
  ) {}

  /**
   * Make a payment on a debt (partial or full)
   * @param data Payment data
   * @param createTransaction If true, creates a linked transaction
   */
  async execute(data: PayDebtData, createTransaction: boolean = true): Promise<Result<DebtPaymentEntity>> {
    try {
      const validation = this.validate(data);
      if (!validation.isValid) {
        return ResultHelper.failure(new ValidationError(validation.error!));
      }

      // Check if debt exists and is active
      const debt = await this.debtRepository.findById(data.debtId);
      if (!debt) {
        return ResultHelper.failure(new NotFoundError('Debt not found'));
      }

      if (debt.status !== DebtStatus.ACTIVE) {
        return ResultHelper.failure(new BusinessLogicError('Cannot pay a non-active debt'));
      }

      // Check if payment amount exceeds remaining
      if (data.amount > debt.remainingAmount) {
        return ResultHelper.failure(
          new ValidationError(`Payment amount (${data.amount}) exceeds remaining debt (${debt.remainingAmount})`)
        );
      }

      // Add the payment
      const payment = await this.debtRepository.addPayment(data);

      // Check if debt became fully paid and update active count
      const updatedDebt = await this.debtRepository.findById(data.debtId);
      if (updatedDebt && updatedDebt.status === DebtStatus.PAID) {
        await this.updateActiveDebtsCount(debt.userId);
      }

      // Create linked transaction if requested
      if (createTransaction) {
        // When debt is paid:
        // - If "I owed someone" (I_OWE) and I pay them = expense for me
        // - If "someone owed me" (OWED_TO_ME) and they pay me = income for me

        const isExpense = debt.type === DebtType.I_OWE; // I'm paying back

        const description = debt.type === DebtType.I_OWE
          ? `Вернул долг: ${debt.personName}`
          : `Получил возврат долга от: ${debt.personName}`;

        const transactionResult = await this.createTransactionUseCase.execute({
          userId: debt.userId,
          amount: data.amount,
          type: isExpense ? 'expense' : 'income',
          category: DEBT_CATEGORY,
          description: data.note || description,
          date: new Date().toISOString().split('T')[0],
          isDebtRelated: true,
          relatedDebtId: debt.id
        });

        if (!transactionResult.success) {
          logger.warn('Failed to create linked transaction for debt payment', {
            debtId: data.debtId,
            error: transactionResult.error?.message
          });
        }
      }

      return ResultHelper.success(payment);
    } catch (error) {
      logger.error('Error paying debt', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to process payment'));
    }
  }

  /**
   * Pay off the entire remaining debt
   */
  async executePayFull(debtId: string, note?: string, createTransaction: boolean = true): Promise<Result<DebtPaymentEntity>> {
    try {
      if (!debtId?.trim()) {
        return ResultHelper.failure(new ValidationError('Debt ID is required'));
      }

      const debt = await this.debtRepository.findById(debtId);
      if (!debt) {
        return ResultHelper.failure(new NotFoundError('Debt not found'));
      }

      if (debt.status !== DebtStatus.ACTIVE) {
        return ResultHelper.failure(new BusinessLogicError('Cannot pay a non-active debt'));
      }

      return this.execute({
        debtId,
        amount: debt.remainingAmount,
        note: note || 'Full payment'
      }, createTransaction);
    } catch (error) {
      logger.error('Error paying full debt', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to process full payment'));
    }
  }

  /**
   * Get a payment by ID (for ownership verification)
   */
  async executeGetPaymentById(paymentId: string): Promise<Result<DebtPaymentEntity>> {
    try {
      if (!paymentId?.trim()) {
        return ResultHelper.failure(new ValidationError('Payment ID is required'));
      }

      const payment = await this.debtRepository.findPaymentById(paymentId);
      if (!payment) {
        return ResultHelper.failure(new NotFoundError('Payment not found'));
      }

      return ResultHelper.success(payment);
    } catch (error) {
      logger.error('Error getting payment', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to get payment'));
    }
  }

  /**
   * Delete a payment and restore the amount to the debt
   */
  async executeDeletePayment(paymentId: string): Promise<Result<void>> {
    try {
      if (!paymentId?.trim()) {
        return ResultHelper.failure(new ValidationError('Payment ID is required'));
      }

      await this.debtRepository.deletePayment(paymentId);
      return ResultHelper.success(undefined);
    } catch (error) {
      logger.error('Error deleting payment', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to delete payment'));
    }
  }

  private validate(data: PayDebtData): { isValid: boolean; error?: string } {
    if (!data.debtId?.trim()) {
      return { isValid: false, error: 'Debt ID is required' };
    }

    if (!data.amount || data.amount <= 0) {
      return { isValid: false, error: 'Amount must be greater than 0' };
    }

    return { isValid: true };
  }

  /**
   * Resolve userId to UUID - handles both telegramId and UUID inputs
   */
  private async resolveToUUID(userIdOrTelegramId: string): Promise<string> {
    // If already UUID, return as-is
    if (isUUID(userIdOrTelegramId)) {
      return userIdOrTelegramId;
    }

    // Otherwise resolve telegramId to UUID
    const user = await this.userModule!.getGetOrCreateUserUseCase().execute({
      telegramId: userIdOrTelegramId,
    });
    return user.id;
  }

  /**
   * Update active debts count in usage_limits after debt status change
   */
  private async updateActiveDebtsCount(userIdOrTelegramId: string): Promise<void> {
    if (!this.subscriptionModule || !this.userModule) {
      return;
    }

    try {
      // Resolve to UUID (handles both telegramId and UUID)
      const userId = await this.resolveToUUID(userIdOrTelegramId);

      // Get actual count of active debts
      const activeDebts = await this.debtRepository.findByUserId(userId, DebtStatus.ACTIVE);
      const currentCount = activeDebts.length;

      // Sync the count
      await this.subscriptionModule.getSetActiveDebtsCountUseCase().execute({
        userId,
        count: currentCount,
      });
    } catch (error) {
      logger.error('Error updating active debts count', error as Error);
      // Non-critical - don't fail the main operation
    }
  }
}
