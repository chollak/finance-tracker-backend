import { BudgetEntity, CreateBudgetData, UpdateBudgetData, BudgetSummary } from './budgetEntity';

export interface BudgetRepository {
  create(budgetData: CreateBudgetData): Promise<BudgetEntity>;
  getById(id: string): Promise<BudgetEntity | null>;
  getByUserId(userId: string): Promise<BudgetEntity[]>;
  getActiveBudgetsByUserId(userId: string): Promise<BudgetEntity[]>;
  update(id: string, updateData: UpdateBudgetData): Promise<BudgetEntity>;
  delete(id: string): Promise<void>;
  getBudgetSummary(budgetId: string): Promise<BudgetSummary | null>;
  getBudgetSummaries(userId: string): Promise<BudgetSummary[]>;
  updateSpentAmount(budgetId: string, spent: number): Promise<void>;
}