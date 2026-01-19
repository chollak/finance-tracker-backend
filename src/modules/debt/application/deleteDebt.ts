import { DebtRepository } from '../domain/debtRepository';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, BusinessLogicError, NotFoundError } from '../../../shared/domain/errors/AppError';

export class DeleteDebtUseCase {
  constructor(private debtRepository: DebtRepository) {}

  async execute(debtId: string): Promise<Result<void>> {
    try {
      if (!debtId?.trim()) {
        return ResultHelper.failure(new ValidationError('Debt ID is required'));
      }

      // Check if debt exists
      const existing = await this.debtRepository.getById(debtId);
      if (!existing) {
        return ResultHelper.failure(new NotFoundError('Debt not found'));
      }

      await this.debtRepository.delete(debtId);
      return ResultHelper.success(undefined);
    } catch (error) {
      console.error('Error deleting debt:', error);
      return ResultHelper.failure(new BusinessLogicError('Failed to delete debt'));
    }
  }
}
