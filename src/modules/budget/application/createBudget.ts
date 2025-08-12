import { BudgetRepository } from '../domain/budgetRepository';
import { CreateBudgetData, BudgetEntity } from '../domain/budgetEntity';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError, BusinessLogicError } from '../../../shared/domain/errors/AppError';

export class CreateBudgetUseCase {
  private budgetRepository: BudgetRepository;

  constructor(budgetRepository: BudgetRepository) {
    this.budgetRepository = budgetRepository;
  }

  async execute(budgetData: CreateBudgetData): Promise<Result<BudgetEntity>> {
    try {
      // Validate budget data
      const validation = this.validateBudgetData(budgetData);
      if (!validation.isValid) {
        return ResultHelper.failure(new ValidationError(validation.error!));
      }

      // Create the budget
      const budget = await this.budgetRepository.create(budgetData);
      
      return ResultHelper.success(budget);
    } catch (error) {
      console.error('Error creating budget:', error);
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