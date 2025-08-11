import { BudgetPeriod } from '../../../database/entities/Budget';

export interface BudgetEntity {
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

export interface CreateBudgetData {
  name: string;
  amount: number;
  period: BudgetPeriod;
  startDate: string;
  endDate: string;
  categoryIds?: string[];
  description?: string;
  userId: string;
}

export interface UpdateBudgetData {
  name?: string;
  amount?: number;
  period?: BudgetPeriod;
  startDate?: string;
  endDate?: string;
  categoryIds?: string[];
  isActive?: boolean;
  description?: string;
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