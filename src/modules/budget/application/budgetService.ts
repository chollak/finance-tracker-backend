import { BudgetRepository } from '../domain/budgetRepository';
import { TransactionRepository } from '../../transaction/domain/transactionRepository';
import { BudgetSummary } from '../domain/budgetEntity';
import { BudgetPeriod } from '../../../database/entities/Budget';

export class BudgetService {
  private budgetRepository: BudgetRepository;
  private transactionRepository: TransactionRepository;

  constructor(budgetRepository: BudgetRepository, transactionRepository: TransactionRepository) {
    this.budgetRepository = budgetRepository;
    this.transactionRepository = transactionRepository;
  }

  async recalculateBudgetSpending(budgetId: string): Promise<void> {
    const budget = await this.budgetRepository.getById(budgetId);
    if (!budget) return;

    // Get transactions within budget period
    const transactions = await this.transactionRepository.getByUserIdAndDateRange(
      budget.userId,
      new Date(budget.startDate),
      new Date(budget.endDate)
    );

    let totalSpent = 0;
    
    // Filter by categories if specified
    if (budget.categoryIds && budget.categoryIds.length > 0) {
      totalSpent = transactions
        .filter(t => t.type === 'expense' && budget.categoryIds!.includes(t.category))
        .reduce((sum, t) => sum + t.amount, 0);
    } else {
      // Include all expenses if no categories specified
      totalSpent = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
    }

    await this.budgetRepository.updateSpentAmount(budgetId, totalSpent);
  }

  async recalculateAllUserBudgets(userId: string): Promise<void> {
    const budgets = await this.budgetRepository.getActiveBudgetsByUserId(userId);
    
    for (const budget of budgets) {
      await this.recalculateBudgetSpending(budget.id);
    }
  }

  async getBudgetsNearLimit(userId: string, threshold: number = 0.8): Promise<BudgetSummary[]> {
    const summaries = await this.budgetRepository.getBudgetSummaries(userId);
    
    return summaries.filter(summary => 
      summary.percentageUsed >= threshold && !summary.isOverBudget
    );
  }

  async getOverBudgets(userId: string): Promise<BudgetSummary[]> {
    const summaries = await this.budgetRepository.getBudgetSummaries(userId);
    
    return summaries.filter(summary => summary.isOverBudget);
  }

  async getBudgetSummaries(userId: string): Promise<BudgetSummary[]> {
    return await this.budgetRepository.getBudgetSummaries(userId);
  }

  generateBudgetPeriodDates(period: BudgetPeriod, startDate?: Date): { startDate: string; endDate: string } {
    const start = startDate || new Date();
    let end: Date;

    switch (period) {
      case BudgetPeriod.WEEKLY:
        end = new Date(start);
        end.setDate(start.getDate() + 7);
        break;
      case BudgetPeriod.MONTHLY:
        end = new Date(start);
        end.setMonth(start.getMonth() + 1);
        break;
      case BudgetPeriod.QUARTERLY:
        end = new Date(start);
        end.setMonth(start.getMonth() + 3);
        break;
      case BudgetPeriod.YEARLY:
        end = new Date(start);
        end.setFullYear(start.getFullYear() + 1);
        break;
      default:
        end = new Date(start);
        end.setMonth(start.getMonth() + 1);
    }

    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    };
  }
}