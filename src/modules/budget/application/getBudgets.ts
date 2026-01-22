import { BudgetRepository } from '../domain/budgetRepository';
import { BudgetEntity, BudgetSummary } from '../domain/budgetEntity';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { createLogger, LogCategory } from '../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.BUDGET);

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

      const budgets = await this.budgetRepository.findByUserId(userId);
      return ResultHelper.success(budgets);
    } catch (error) {
      logger.error('Error getting budgets', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to get budgets'));
    }
  }

  async executeGetActive(userId: string): Promise<Result<BudgetEntity[]>> {
    try {
      if (!userId?.trim()) {
        return ResultHelper.failure(new ValidationError('User ID is required'));
      }

      const budgets = await this.budgetRepository.findActiveByUserId(userId);
      return ResultHelper.success(budgets);
    } catch (error) {
      logger.error('Error getting active budgets', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to get active budgets'));
    }
  }

  async executeGetById(budgetId: string): Promise<Result<BudgetEntity | null>> {
    try {
      if (!budgetId?.trim()) {
        return ResultHelper.failure(new ValidationError('Budget ID is required'));
      }

      const budget = await this.budgetRepository.findById(budgetId);
      return ResultHelper.success(budget);
    } catch (error) {
      logger.error('Error getting budget', error as Error);
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
      logger.error('Error getting budget summaries', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to get budget summaries'));
    }
  }
}