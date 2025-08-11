import { BudgetRepository } from '../domain/budgetRepository';
import { Result, ResultHelper } from '../../../shared/types/Result';
import { ValidationError, BusinessLogicError, NotFoundError } from '../../../shared/errors/AppError';

export class DeleteBudgetUseCase {
  private budgetRepository: BudgetRepository;

  constructor(budgetRepository: BudgetRepository) {
    this.budgetRepository = budgetRepository;
  }

  async execute(budgetId: string): Promise<Result<void>> {
    try {
      if (!budgetId?.trim()) {
        return ResultHelper.failure(new ValidationError('Budget ID is required'));
      }

      // Check if budget exists
      const existingBudget = await this.budgetRepository.getById(budgetId);
      if (!existingBudget) {
        return ResultHelper.failure(new NotFoundError('Budget', budgetId));
      }

      // Delete the budget
      await this.budgetRepository.delete(budgetId);
      
      return ResultHelper.success(undefined);
    } catch (error) {
      console.error('Error deleting budget:', error);
      return ResultHelper.failure(new BusinessLogicError('Failed to delete budget'));
    }
  }
}