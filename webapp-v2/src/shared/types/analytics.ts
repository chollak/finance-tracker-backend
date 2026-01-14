// Analytics types
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
