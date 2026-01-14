// Budget types
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
  startDate: string;
  endDate: string;
  categoryIds?: string[];
  description?: string;
}

// DTO types for API calls
export interface CreateBudgetDTO {
  name: string;
  amount: number;
  period: BudgetPeriod;
  startDate: string;
  endDate: string;
  categoryIds?: string[];
  description?: string;
  userId: string;
}

export interface UpdateBudgetDTO {
  name?: string;
  amount?: number;
  period?: BudgetPeriod;
  startDate?: string;
  endDate?: string;
  categoryIds?: string[];
  isActive?: boolean;
  description?: string;
}
