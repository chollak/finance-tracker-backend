import { AnalyticsService, TimeRange, MonthlyTrend } from '../../../transaction/application/analyticsService';
import { BudgetService } from '../../../budget/application/budgetService';
import { BudgetSummary } from '../../../budget/domain/budgetEntity';

export interface DashboardInsights {
  financialSummary: {
    totalIncome: number;
    totalExpense: number;
    netIncome: number;
    transactionCount: number;
    period: string;
  };
  budgetOverview: {
    totalBudgets: number;
    activeBudgets: number;
    totalBudgetAmount: number;
    totalSpent: number;
    budgetsNearLimit: number;
    overBudgetCount: number;
  };
  topCategories: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  monthlyTrends: MonthlyTrend[];
  spendingPatterns: Array<{
    dayOfWeek: string;
    averageAmount: number;
    transactionCount: number;
  }>;
  budgetAlerts: {
    nearLimit: BudgetSummary[];
    overBudget: BudgetSummary[];
    recommendations: string[];
  };
  insights: {
    topSpendingDay: string;
    averageMonthlySpending: number;
    spendingTrend: 'increasing' | 'decreasing' | 'stable';
    budgetUtilization: number;
    savingsRate: number;
  };
}

export interface WeeklyInsight {
  week: string;
  income: number;
  expenses: number;
  net: number;
  budgetPerformance: number; // percentage of budget used
  topCategory: string;
}

export interface FinancialHealthScore {
  score: number; // 0-100
  factors: {
    budgetCompliance: number;
    savingsRate: number;
    expenseVariability: number;
    categoryDiversification: number;
  };
  recommendations: string[];
}

export class DashboardService {
  constructor(
    private analyticsService: AnalyticsService,
    private budgetService: BudgetService
  ) {}

  async getDashboardInsights(userId: string, timeRange?: TimeRange): Promise<DashboardInsights> {
    // Get analytics data
    const [
      financialSummary,
      topCategories,
      monthlyTrends,
      spendingPatterns,
      budgetSummaries
    ] = await Promise.all([
      this.analyticsService.getAnalyticsSummary(userId, timeRange),
      this.analyticsService.getTopCategories(userId, timeRange, 5),
      this.analyticsService.getMonthlyTrends(userId, 6),
      this.analyticsService.getSpendingPatterns(userId, timeRange),
      this.budgetService.getBudgetSummaries(userId)
    ]);

    // Get budget alerts
    const [nearLimit, overBudget] = await Promise.all([
      this.budgetService.getBudgetsNearLimit(userId, 0.8),
      this.budgetService.getOverBudgets(userId)
    ]);

    // Calculate budget overview
    const budgetOverview = this.calculateBudgetOverview(budgetSummaries, nearLimit, overBudget);

    // Generate insights
    const insights = this.generateInsights(financialSummary, monthlyTrends, spendingPatterns, budgetSummaries);

    // Generate recommendations
    const recommendations = this.generateRecommendations(budgetSummaries, nearLimit, overBudget, insights);

    return {
      financialSummary,
      budgetOverview,
      topCategories,
      monthlyTrends,
      spendingPatterns,
      budgetAlerts: {
        nearLimit,
        overBudget,
        recommendations
      },
      insights
    };
  }

  async getWeeklyInsights(userId: string, weeks: number = 4): Promise<WeeklyInsight[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - (weeks * 7));

    const timeRange = { startDate, endDate };
    const transactions = await this.analyticsService.getAnalyticsSummary(userId, timeRange);
    const categoryBreakdown = await this.analyticsService.getDetailedCategoryBreakdown(userId, timeRange);
    
    // This is a simplified version - in a real implementation, you'd calculate week-by-week data
    const weeklyInsights: WeeklyInsight[] = [];
    
    for (let i = 0; i < weeks; i++) {
      const weekStart = new Date(startDate);
      weekStart.setDate(startDate.getDate() + (i * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const weekRange = { startDate: weekStart, endDate: weekEnd };
      const weekSummary = await this.analyticsService.getAnalyticsSummary(userId, weekRange);
      const topCategoryThisWeek = await this.analyticsService.getTopCategories(userId, weekRange, 1);

      weeklyInsights.push({
        week: `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`,
        income: weekSummary.totalIncome,
        expenses: weekSummary.totalExpense,
        net: weekSummary.netIncome,
        budgetPerformance: 75, // Simplified - would calculate based on actual budgets
        topCategory: topCategoryThisWeek[0]?.category || 'N/A'
      });
    }

    return weeklyInsights;
  }

  async calculateFinancialHealthScore(userId: string): Promise<FinancialHealthScore> {
    const [
      summary,
      budgetSummaries,
      monthlyTrends,
      categoryBreakdown
    ] = await Promise.all([
      this.analyticsService.getAnalyticsSummary(userId),
      this.budgetService.getBudgetSummaries(userId),
      this.analyticsService.getMonthlyTrends(userId, 6),
      this.analyticsService.getDetailedCategoryBreakdown(userId)
    ]);

    // Calculate component scores (0-100)
    const budgetCompliance = this.calculateBudgetCompliance(budgetSummaries);
    const savingsRate = this.calculateSavingsRate(summary);
    const expenseVariability = this.calculateExpenseVariability(monthlyTrends);
    const categoryDiversification = this.calculateCategoryDiversification(categoryBreakdown);

    // Weighted overall score
    const score = Math.round(
      (budgetCompliance * 0.3) +
      (savingsRate * 0.25) +
      (expenseVariability * 0.25) +
      (categoryDiversification * 0.2)
    );

    const recommendations = this.generateHealthRecommendations({
      score,
      budgetCompliance,
      savingsRate,
      expenseVariability,
      categoryDiversification
    });

    return {
      score,
      factors: {
        budgetCompliance,
        savingsRate,
        expenseVariability,
        categoryDiversification
      },
      recommendations
    };
  }

  private calculateBudgetOverview(
    budgetSummaries: BudgetSummary[],
    nearLimit: BudgetSummary[],
    overBudget: BudgetSummary[]
  ) {
    return {
      totalBudgets: budgetSummaries.length,
      activeBudgets: budgetSummaries.length, // All summaries are for active budgets
      totalBudgetAmount: budgetSummaries.reduce((sum, b) => sum + b.amount, 0),
      totalSpent: budgetSummaries.reduce((sum, b) => sum + b.spent, 0),
      budgetsNearLimit: nearLimit.length,
      overBudgetCount: overBudget.length
    };
  }

  private generateInsights(
    summary: any,
    trends: MonthlyTrend[],
    patterns: any[],
    budgets: BudgetSummary[]
  ) {
    // Find top spending day
    const topSpendingDay = patterns.reduce((max, current) => 
      current.averageAmount > max.averageAmount ? current : max,
      patterns[0]
    ).dayOfWeek;

    // Calculate average monthly spending from trends
    const averageMonthlySpending = trends.length > 0 
      ? trends.reduce((sum, t) => sum + t.expenses, 0) / trends.length 
      : 0;

    // Determine spending trend
    const spendingTrend = this.calculateSpendingTrend(trends);

    // Calculate budget utilization
    const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
    const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
    const budgetUtilization = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    // Calculate savings rate
    const savingsRate = summary.totalIncome > 0 
      ? ((summary.totalIncome - summary.totalExpense) / summary.totalIncome) * 100 
      : 0;

    return {
      topSpendingDay,
      averageMonthlySpending: Math.round(averageMonthlySpending * 100) / 100,
      spendingTrend,
      budgetUtilization: Math.round(budgetUtilization * 100) / 100,
      savingsRate: Math.round(savingsRate * 100) / 100
    };
  }

  private calculateSpendingTrend(trends: MonthlyTrend[]): 'increasing' | 'decreasing' | 'stable' {
    if (trends.length < 2) return 'stable';
    
    const recent = trends.slice(-3);
    const earlier = trends.slice(0, -3);
    
    if (recent.length < 2 || earlier.length < 2) return 'stable';
    
    const recentAvg = recent.reduce((sum, t) => sum + t.expenses, 0) / recent.length;
    const earlierAvg = earlier.reduce((sum, t) => sum + t.expenses, 0) / earlier.length;
    
    const changePercent = ((recentAvg - earlierAvg) / earlierAvg) * 100;
    
    if (changePercent > 10) return 'increasing';
    if (changePercent < -10) return 'decreasing';
    return 'stable';
  }

  private generateRecommendations(
    budgets: BudgetSummary[],
    nearLimit: BudgetSummary[],
    overBudget: BudgetSummary[],
    insights: any
  ): string[] {
    const recommendations: string[] = [];

    if (overBudget.length > 0) {
      recommendations.push(`You've exceeded ${overBudget.length} budget(s). Consider reviewing your spending in these categories.`);
    }

    if (nearLimit.length > 0) {
      recommendations.push(`${nearLimit.length} budget(s) are near their limit. Monitor your spending closely this period.`);
    }

    if (insights.savingsRate < 10) {
      recommendations.push('Your savings rate is low. Try to reduce expenses or increase income to save more.');
    }

    if (insights.spendingTrend === 'increasing') {
      recommendations.push('Your spending has been increasing. Review recent transactions to identify areas to cut back.');
    }

    if (insights.budgetUtilization > 90) {
      recommendations.push('You\'re using most of your budget. Consider adjusting budget amounts or reducing spending.');
    }

    return recommendations;
  }

  // Financial health calculation methods
  private calculateBudgetCompliance(budgets: BudgetSummary[]): number {
    if (budgets.length === 0) return 50; // Neutral score if no budgets
    
    const compliantBudgets = budgets.filter(b => !b.isOverBudget).length;
    return (compliantBudgets / budgets.length) * 100;
  }

  private calculateSavingsRate(summary: any): number {
    if (summary.totalIncome <= 0) return 0;
    
    const savingsRate = ((summary.totalIncome - summary.totalExpense) / summary.totalIncome) * 100;
    return Math.max(0, Math.min(100, savingsRate));
  }

  private calculateExpenseVariability(trends: MonthlyTrend[]): number {
    if (trends.length < 2) return 50;
    
    const expenses = trends.map(t => t.expenses);
    const avg = expenses.reduce((sum, e) => sum + e, 0) / expenses.length;
    const variance = expenses.reduce((sum, e) => sum + Math.pow(e - avg, 2), 0) / expenses.length;
    const coefficient = avg > 0 ? Math.sqrt(variance) / avg : 0;
    
    // Lower variability = higher score
    return Math.max(0, Math.min(100, (1 - coefficient) * 100));
  }

  private calculateCategoryDiversification(breakdown: any): number {
    const categories = Object.keys(breakdown);
    if (categories.length <= 1) return 25;
    
    const totalAmount = Object.values(breakdown).reduce((sum: number, cat: any) => sum + cat.amount, 0);
    const entropy = categories.reduce((entropy, category) => {
      const p = (breakdown as any)[category].amount / totalAmount;
      return entropy - (p > 0 ? p * Math.log2(p) : 0);
    }, 0);
    
    const maxEntropy = Math.log2(categories.length);
    return (entropy / maxEntropy) * 100;
  }

  private generateHealthRecommendations(factors: any): string[] {
    const recommendations: string[] = [];

    if (factors.budgetCompliance < 70) {
      recommendations.push('Improve budget adherence by setting more realistic budget amounts and tracking spending regularly.');
    }

    if (factors.savingsRate < 50) {
      recommendations.push('Increase your savings rate by reducing unnecessary expenses and automating savings.');
    }

    if (factors.expenseVariability < 50) {
      recommendations.push('Your expenses are quite variable. Try to create more predictable spending patterns.');
    }

    if (factors.categoryDiversification < 50) {
      recommendations.push('Consider diversifying your spending across more categories to reduce financial risk.');
    }

    return recommendations;
  }
}