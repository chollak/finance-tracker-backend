import type { AnalyticsSummary, MonthlyTrend, SpendingPattern } from './analytics';
import type { BudgetSummary } from './budget';

// Dashboard types
export interface DashboardInsights {
  financialSummary: AnalyticsSummary;
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
  spendingPatterns: SpendingPattern[];
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

// Financial Health
export interface FinancialHealthScore {
  score: number;
  factors: {
    budgetCompliance: number;
    savingsRate: number;
    expenseVariability: number;
    categoryDiversification: number;
  };
  recommendations: string[];
}

// Full Dashboard API Response
export interface DashboardData {
  insights: DashboardInsights;
  alerts: {
    active: Array<{
      id: string;
      type: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      title: string;
      message: string;
      timestamp: string;
    }>;
    summary: {
      total: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
      actionable: number;
    };
  };
  healthScore: FinancialHealthScore;
  weeklyInsights: Array<{
    week: string;
    income: number;
    expenses: number;
    net: number;
    budgetPerformance: number;
    topCategory: string;
  }>;
  lastUpdated: string;
}
