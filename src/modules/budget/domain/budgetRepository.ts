import { BudgetEntity, CreateBudgetData, UpdateBudgetData, BudgetSummary } from './budgetEntity';

export interface BudgetRepository {
  create(budgetData: CreateBudgetData): Promise<BudgetEntity>;
  findById(id: string): Promise<BudgetEntity | null>;
  findByUserId(userId: string): Promise<BudgetEntity[]>;
  findActiveByUserId(userId: string): Promise<BudgetEntity[]>;
  update(id: string, updateData: UpdateBudgetData): Promise<BudgetEntity>;
  delete(id: string): Promise<void>;
  getBudgetSummary(budgetId: string): Promise<BudgetSummary | null>;
  getBudgetSummaries(userId: string): Promise<BudgetSummary[]>;
  updateSpentAmount(budgetId: string, spent: number): Promise<void>;
}