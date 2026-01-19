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

export class GetDebtsUseCase {
  constructor(private debtRepository: DebtRepository) {}

  async executeGetAll(userId: string, status?: DebtStatus): Promise<Result<DebtEntity[]>> {
    try {
      if (!userId?.trim()) {
        return ResultHelper.failure(new ValidationError('User ID is required'));
      }

      const debts = await this.debtRepository.getByUserId(userId, status);
      return ResultHelper.success(debts);
    } catch (error) {
      console.error('Error getting debts:', error);
      return ResultHelper.failure(new BusinessLogicError('Failed to get debts'));
    }
  }

  async executeGetById(debtId: string): Promise<Result<DebtEntity | null>> {
    try {
      if (!debtId?.trim()) {
        return ResultHelper.failure(new ValidationError('Debt ID is required'));
      }

      const debt = await this.debtRepository.getById(debtId);
      return ResultHelper.success(debt);
    } catch (error) {
      console.error('Error getting debt:', error);
      return ResultHelper.failure(new BusinessLogicError('Failed to get debt'));
    }
  }

  async executeGetWithPayments(debtId: string): Promise<Result<DebtWithPayments | null>> {
    try {
      if (!debtId?.trim()) {
        return ResultHelper.failure(new ValidationError('Debt ID is required'));
      }

      const debt = await this.debtRepository.getWithPayments(debtId);
      return ResultHelper.success(debt);
    } catch (error) {
      console.error('Error getting debt with payments:', error);
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

      const debts = await this.debtRepository.getByType(userId, type);
      return ResultHelper.success(debts);
    } catch (error) {
      console.error('Error getting debts by type:', error);
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
      console.error('Error getting debt summary:', error);
      return ResultHelper.failure(new BusinessLogicError('Failed to get debt summary'));
    }
  }
}
