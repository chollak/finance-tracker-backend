import { DebtRepository } from '../domain/debtRepository';
import {
  DebtEntity,
  DebtWithPayments,
  DebtSummary,
  DebtStatus,
  DebtType
} from '../domain/debtEntity';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { createLogger, LogCategory } from '../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.DEBT);

export class GetDebtsUseCase {
  constructor(private debtRepository: DebtRepository) {}

  async executeGetAll(userId: string, status?: DebtStatus): Promise<Result<DebtEntity[]>> {
    try {
      if (!userId?.trim()) {
        return ResultHelper.failure(new ValidationError('User ID is required'));
      }

      const debts = await this.debtRepository.findByUserId(userId, status);
      return ResultHelper.success(debts);
    } catch (error) {
      logger.error('Error getting debts', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to get debts'));
    }
  }

  async executeGetById(debtId: string): Promise<Result<DebtEntity | null>> {
    try {
      if (!debtId?.trim()) {
        return ResultHelper.failure(new ValidationError('Debt ID is required'));
      }

      const debt = await this.debtRepository.findById(debtId);
      return ResultHelper.success(debt);
    } catch (error) {
      logger.error('Error getting debt', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to get debt'));
    }
  }

  async executeGetWithPayments(debtId: string): Promise<Result<DebtWithPayments | null>> {
    try {
      if (!debtId?.trim()) {
        return ResultHelper.failure(new ValidationError('Debt ID is required'));
      }

      const debt = await this.debtRepository.findWithPayments(debtId);
      return ResultHelper.success(debt);
    } catch (error) {
      logger.error('Error getting debt with payments', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to get debt with payments'));
    }
  }

  async executeGetByType(userId: string, type: DebtType): Promise<Result<DebtEntity[]>> {
    try {
      if (!userId?.trim()) {
        return ResultHelper.failure(new ValidationError('User ID is required'));
      }

      if (!Object.values(DebtType).includes(type)) {
        return ResultHelper.failure(new ValidationError('Invalid debt type'));
      }

      const debts = await this.debtRepository.findByType(userId, type);
      return ResultHelper.success(debts);
    } catch (error) {
      logger.error('Error getting debts by type', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to get debts by type'));
    }
  }

  async executeGetSummary(userId: string): Promise<Result<DebtSummary>> {
    try {
      if (!userId?.trim()) {
        return ResultHelper.failure(new ValidationError('User ID is required'));
      }

      const summary = await this.debtRepository.getSummary(userId);
      return ResultHelper.success(summary);
    } catch (error) {
      logger.error('Error getting debt summary', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to get debt summary'));
    }
  }
}
