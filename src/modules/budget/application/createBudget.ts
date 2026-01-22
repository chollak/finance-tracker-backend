import { BudgetRepository } from '../domain/budgetRepository';
import { CreateBudgetData, BudgetEntity, BudgetPeriod } from '../domain/budgetEntity';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';

const logger = getLogger(LogCategory.BUDGET);

/**
 * Calculate start and end dates based on period type
 */
function calculatePeriodDates(period: BudgetPeriod): { startDate: string; endDate: string } {
  const now = new Date();

  switch (period) {
    case 'daily': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      end.setMilliseconds(end.getMilliseconds() - 1);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      };
    }
    case 'weekly': {
      const dayOfWeek = now.getDay();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      };
    }
    case 'monthly': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      };
    }
    case 'yearly': {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      };
    }
    default: {
      // Default to monthly
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      };
    }
  }
}

export class CreateBudgetUseCase {
  private budgetRepository: BudgetRepository;

  constructor(budgetRepository: BudgetRepository) {
    this.budgetRepository = budgetRepository;
  }

  async execute(budgetData: CreateBudgetData): Promise<Result<BudgetEntity>> {
    try {
      // Auto-calculate dates if period is provided but dates are not
      if (budgetData.period && (!budgetData.startDate || !budgetData.endDate)) {
        const calculatedDates = calculatePeriodDates(budgetData.period);
        budgetData = {
          ...budgetData,
          startDate: budgetData.startDate || calculatedDates.startDate,
          endDate: budgetData.endDate || calculatedDates.endDate,
        };
      }

      // Validate budget data
      const validation = this.validateBudgetData(budgetData);
      if (!validation.isValid) {
        return ResultHelper.failure(new ValidationError(validation.error!));
      }

      // Create the budget
      const budget = await this.budgetRepository.create(budgetData);

      return ResultHelper.success(budget);
    } catch (error) {
      logger.error('Error creating budget', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to create budget'));
    }
  }

  private validateBudgetData(data: CreateBudgetData): { isValid: boolean; error?: string } {
    if (!data.name?.trim()) {
      return { isValid: false, error: 'Budget name is required' };
    }

    if (!data.amount || data.amount <= 0) {
      return { isValid: false, error: 'Budget amount must be greater than 0' };
    }

    if (!data.userId?.trim()) {
      return { isValid: false, error: 'User ID is required' };
    }

    if (!data.startDate || !data.endDate) {
      return { isValid: false, error: 'Start date and end date are required' };
    }

    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    if (startDate >= endDate) {
      return { isValid: false, error: 'End date must be after start date' };
    }

    return { isValid: true };
  }
}