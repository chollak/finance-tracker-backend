import { BudgetRepository } from '../domain/budgetRepository';
import { BudgetEntity, BudgetSummary } from '../domain/budgetEntity';
import { Result, ResultHelper } from '../../../shared/types/Result';
import { ValidationError, BusinessLogicError } from '../../../shared/errors/AppError';

export class GetBudgetsUseCase {
  private budgetRepository: BudgetRepository;

  constructor(budgetRepository: BudgetRepository) {
    this.budgetRepository = budgetRepository;
  }

  async executeGetAll(userId: string): Promise<Result<BudgetEntity[]>> {
    try {
      if (!userId?.trim()) {
        return ResultHelper.failure(new ValidationError('User ID is required'));
      }

      const budgets = await this.budgetRepository.getByUserId(userId);
      return ResultHelper.success(budgets);
    } catch (error) {
      console.error('Error getting budgets:', error);
      return ResultHelper.failure(new BusinessLogicError('Failed to get budgets'));
    }
  }

  async executeGetActive(userId: string): Promise<Result<BudgetEntity[]>> {
    try {
      if (!userId?.trim()) {
        return ResultHelper.failure(new ValidationError('User ID is required'));
      }

      const budgets = await this.budgetRepository.getActiveBudgetsByUserId(userId);
      return ResultHelper.success(budgets);
    } catch (error) {
      console.error('Error getting active budgets:', error);
      return ResultHelper.failure(new BusinessLogicError('Failed to get active budgets'));
    }
  }

  async executeGetById(budgetId: string): Promise<Result<BudgetEntity | null>> {
    try {
      if (!budgetId?.trim()) {
        return ResultHelper.failure(new ValidationError('Budget ID is required'));
      }

      const budget = await this.budgetRepository.getById(budgetId);
      return ResultHelper.success(budget);
    } catch (error) {
      console.error('Error getting budget:', error);
      return ResultHelper.failure(new BusinessLogicError('Failed to get budget'));
    }
  }

  async executeGetSummaries(userId: string): Promise<Result<BudgetSummary[]>> {
    try {
      if (!userId?.trim()) {
        return ResultHelper.failure(new ValidationError('User ID is required'));
      }

      const summaries = await this.budgetRepository.getBudgetSummaries(userId);
      return ResultHelper.success(summaries);
    } catch (error) {
      console.error('Error getting budget summaries:', error);
      return ResultHelper.failure(new BusinessLogicError('Failed to get budget summaries'));
    }
  }
}