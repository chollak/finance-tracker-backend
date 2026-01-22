import { DebtRepository } from '../domain/debtRepository';
import { DebtEntity, UpdateDebtData, DebtStatus } from '../domain/debtEntity';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, BusinessLogicError, NotFoundError } from '../../../shared/domain/errors/AppError';
import { createLogger, LogCategory } from '../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.DEBT);

export class UpdateDebtUseCase {
  constructor(private debtRepository: DebtRepository) {}

  async execute(debtId: string, data: UpdateDebtData): Promise<Result<DebtEntity>> {
    try {
      if (!debtId?.trim()) {
        return ResultHelper.failure(new ValidationError('Debt ID is required'));
      }

      // Check if debt exists
      const existing = await this.debtRepository.findById(debtId);
      if (!existing) {
        return ResultHelper.failure(new NotFoundError('Debt not found'));
      }

      // Validate status if provided
      if (data.status && !Object.values(DebtStatus).includes(data.status)) {
        return ResultHelper.failure(new ValidationError('Invalid debt status'));
      }

      const updated = await this.debtRepository.update(debtId, data);
      return ResultHelper.success(updated);
    } catch (error) {
      logger.error('Error updating debt', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to update debt'));
    }
  }

  async executeCancel(debtId: string): Promise<Result<DebtEntity>> {
    try {
      if (!debtId?.trim()) {
        return ResultHelper.failure(new ValidationError('Debt ID is required'));
      }

      const existing = await this.debtRepository.findById(debtId);
      if (!existing) {
        return ResultHelper.failure(new NotFoundError('Debt not found'));
      }

      const updated = await this.debtRepository.update(debtId, {
        status: DebtStatus.CANCELLED
      });

      return ResultHelper.success(updated);
    } catch (error) {
      logger.error('Error cancelling debt', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to cancel debt'));
    }
  }
}
