import { DebtRepository } from '../domain/debtRepository';
import { DebtStatus } from '../domain/debtEntity';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, BusinessLogicError, NotFoundError } from '../../../shared/domain/errors/AppError';
import { SubscriptionModule } from '../../subscription/subscriptionModule';
import { UserModule } from '../../user/userModule';
import { isUUID } from '../../../shared/application/helpers/userIdResolver';
import { getLogger, LogCategory } from '../../../shared/application/logging';

const logger = getLogger(LogCategory.DEBT);

export class DeleteDebtUseCase {
  constructor(
    private debtRepository: DebtRepository,
    private subscriptionModule?: SubscriptionModule,
    private userModule?: UserModule
  ) {}

  async execute(debtId: string): Promise<Result<void>> {
    try {
      if (!debtId?.trim()) {
        return ResultHelper.failure(new ValidationError('Debt ID is required'));
      }

      // Check if debt exists
      const existing = await this.debtRepository.findById(debtId);
      if (!existing) {
        return ResultHelper.failure(new NotFoundError('Debt not found'));
      }

      const wasActive = existing.status === DebtStatus.ACTIVE;
      const userId = existing.userId;

      await this.debtRepository.delete(debtId);

      // Update active debts count if we deleted an active debt
      if (wasActive) {
        await this.updateActiveDebtsCount(userId);
      }

      return ResultHelper.success(undefined);
    } catch (error) {
      logger.error('Error deleting debt', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to delete debt'));
    }
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
   * Update active debts count in usage_limits after debt deletion
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
