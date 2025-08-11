import { BudgetRepository } from '../domain/budgetRepository';
import { UpdateBudgetData, BudgetEntity } from '../domain/budgetEntity';
import { Result, ResultHelper } from '../../../shared/types/Result';
import { ValidationError, BusinessLogicError, NotFoundError } from '../../../shared/errors/AppError';

export class UpdateBudgetUseCase {
  private budgetRepository: BudgetRepository;

  constructor(budgetRepository: BudgetRepository) {
    this.budgetRepository = budgetRepository;
  }

  async execute(budgetId: string, updateData: UpdateBudgetData): Promise<Result<BudgetEntity>> {
    try {
      if (!budgetId?.trim()) {
        return ResultHelper.failure(new ValidationError('Budget ID is required'));
      }

      // Validate update data
      const validation = this.validateUpdateData(updateData);
      if (!validation.isValid) {
        return ResultHelper.failure(new ValidationError(validation.error!));
      }

      // Check if budget exists
      const existingBudget = await this.budgetRepository.getById(budgetId);
      if (!existingBudget) {
        return ResultHelper.failure(new NotFoundError('Budget', budgetId));
      }

      // Update the budget
      const updatedBudget = await this.budgetRepository.update(budgetId, updateData);
      
      return ResultHelper.success(updatedBudget);
    } catch (error) {
      console.error('Error updating budget:', error);
      return ResultHelper.failure(new BusinessLogicError('Failed to update budget'));
    }
  }

  private validateUpdateData(data: UpdateBudgetData): { isValid: boolean; error?: string } {
    if (data.name !== undefined && !data.name?.trim()) {
      return { isValid: false, error: 'Budget name cannot be empty' };
    }

    if (data.amount !== undefined && data.amount <= 0) {
      return { isValid: false, error: 'Budget amount must be greater than 0' };
    }

    if (data.startDate && data.endDate) {
      const startDate = new Date(data.startDate);
      const endDate = new Date(data.endDate);

      if (startDate >= endDate) {
        return { isValid: false, error: 'End date must be after start date' };
      }
    }

    return { isValid: true };
  }
}