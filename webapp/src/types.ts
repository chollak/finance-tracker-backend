export interface Transaction {
  id?: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  userId: string;
  userName?: string;
  // Enhanced fields for learning
  merchant?: string;
  confidence?: number;
  originalText?: string;
  originalParsing?: {
    amount: number;
    category: string;
    type: 'income' | 'expense';
    merchant?: string;
    confidence?: number;
  };
}

// Budget System Types
export enum BudgetPeriod {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly'
}

export interface Budget {
  id: string;
  name: string;
  amount: number;
  period: BudgetPeriod;
  startDate: string;
  endDate: string;
  categoryIds?: string[];
  isActive: boolean;
  spent: number;
  description?: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetSummary {
  id: string;
  name: string;
  amount: number;
  spent: number;
  remaining: number;
  percentageUsed: number;
  isOverBudget: boolean;
  period: BudgetPeriod;
  daysRemaining: number;
}

// Analytics Types
export interface AnalyticsSummary {
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
  transactionCount: number;
  averageTransactionAmount: number;
  period: string;
}

export interface CategoryBreakdown {
  [category: string]: {
    amount: number;
    count: number;
    percentage: number;
  };
}

export interface MonthlyTrend {
  month: string;
  year: number;
  income: number;
  expenses: number;
  net: number;
  transactionCount: number;
}

export interface SpendingPattern {
  dayOfWeek: string;
  averageAmount: number;
  transactionCount: number;
}

// Dashboard Types
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

// Alert System Types
export enum AlertType {
  BUDGET_EXCEEDED = 'BUDGET_EXCEEDED',
  BUDGET_NEAR_LIMIT = 'BUDGET_NEAR_LIMIT',
  UNUSUAL_SPENDING = 'UNUSUAL_SPENDING',
  HIGH_CATEGORY_SPENDING = 'HIGH_CATEGORY_SPENDING',
  LOW_SAVINGS_RATE = 'LOW_SAVINGS_RATE',
  SPENDING_TREND_UP = 'SPENDING_TREND_UP'
}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  data?: any;
  timestamp: Date;
  userId: string;
  actionable: boolean;
  suggestions?: string[];
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

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}

export interface TelegramWebApp {
  ready: () => void;
  close: () => void;
  expand: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}