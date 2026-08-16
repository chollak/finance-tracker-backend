import { BudgetRepository } from '../domain/budgetRepository';
import { TransactionRepository } from '../../transaction/domain/transactionRepository';
import { BudgetSummary, BudgetPeriod } from '../domain/budgetEntity';
import { countsAsBudgetSpending, normalizeSemanticType } from '../../transaction/domain/transactionSemanticType';
import { BudgetPeriodCalculator } from './budgetPeriodCalculator';

export class BudgetService {
  private budgetRepository: BudgetRepository;
  private transactionRepository: TransactionRepository;

  constructor(
    budgetRepository: BudgetRepository,
    transactionRepository: TransactionRepository,
    private readonly nowProvider: () => Date = () => new Date()
  ) {
    this.budgetRepository = budgetRepository;
    this.transactionRepository = transactionRepository;
  }

  async recalculateBudgetSpending(budgetId: string): Promise<void> {
    const budget = await this.budgetRepository.findById(budgetId);
    if (!budget) return;

    const currentPeriod = BudgetPeriodCalculator.getCurrentRange(
      budget.period,
      budget.startDate,
      this.nowProvider()
    );

    // Get transactions within the current recurring budget period
    const transactions = await this.transactionRepository.getByUserIdAndDateRange(
      budget.userId,
      new Date(currentPeriod.startDate),
      new Date(currentPeriod.endDate)
    );

    let totalSpent = 0;

    const budgetSpendingTransactions = transactions.filter(t =>
      !t.needsReview && countsAsBudgetSpending(normalizeSemanticType(t.semanticType, t.type))
    );

    // Filter by categories if specified
    if (budget.categoryIds && budget.categoryIds.length > 0) {
      totalSpent = budgetSpendingTransactions
        .filter(t => budget.categoryIds!.includes(t.category))
        .reduce((sum, t) => sum + t.amount, 0);
    } else {
      // Include all budget-counted spending if no categories specified
      totalSpent = budgetSpendingTransactions
        .reduce((sum, t) => sum + t.amount, 0);
    }

    await this.budgetRepository.updateSpentAmount(budgetId, totalSpent);
  }

  async recalculateAllUserBudgets(userId: string): Promise<void> {
    const budgets = await this.budgetRepository.findActiveByUserId(userId);
    
    for (const budget of budgets) {
      await this.recalculateBudgetSpending(budget.id);
    }
  }

  async getBudgetsNearLimit(userId: string, threshold: number = 80): Promise<BudgetSummary[]> {
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
    return BudgetPeriodCalculator.getCurrentRange(period, startDate || this.nowProvider(), startDate || this.nowProvider());
  }
}