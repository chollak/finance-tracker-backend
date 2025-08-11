import { Repository } from 'typeorm';
import { AppDataSource } from '../../../database/database.config';
import { Budget } from '../../../database/entities/Budget';
import { Transaction } from '../../../database/entities/Transaction';
import { BudgetRepository } from '../domain/budgetRepository';
import { BudgetEntity, CreateBudgetData, UpdateBudgetData, BudgetSummary } from '../domain/budgetEntity';

export class SqliteBudgetRepository implements BudgetRepository {
  private budgetRepository: Repository<Budget>;
  private transactionRepository: Repository<Transaction>;

  constructor() {
    this.budgetRepository = AppDataSource.getRepository(Budget);
    this.transactionRepository = AppDataSource.getRepository(Transaction);
  }

  async create(budgetData: CreateBudgetData): Promise<BudgetEntity> {
    const budget = this.budgetRepository.create({
      ...budgetData,
      categoryIds: budgetData.categoryIds ? JSON.stringify(budgetData.categoryIds) : undefined,
      spent: 0,
      isActive: true
    });

    const savedBudget = await this.budgetRepository.save(budget);
    return this.mapToEntity(savedBudget);
  }

  async getById(id: string): Promise<BudgetEntity | null> {
    const budget = await this.budgetRepository.findOne({ where: { id } });
    return budget ? this.mapToEntity(budget) : null;
  }

  async getByUserId(userId: string): Promise<BudgetEntity[]> {
    const budgets = await this.budgetRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' }
    });
    return budgets.map(budget => this.mapToEntity(budget));
  }

  async getActiveBudgetsByUserId(userId: string): Promise<BudgetEntity[]> {
    const budgets = await this.budgetRepository.find({
      where: { userId, isActive: true },
      order: { createdAt: 'DESC' }
    });
    return budgets.map(budget => this.mapToEntity(budget));
  }

  async update(id: string, updateData: UpdateBudgetData): Promise<BudgetEntity> {
    const updatePayload = {
      ...updateData,
      categoryIds: updateData.categoryIds ? JSON.stringify(updateData.categoryIds) : undefined
    };

    await this.budgetRepository.update(id, updatePayload);
    const updatedBudget = await this.budgetRepository.findOne({ where: { id } });
    
    if (!updatedBudget) {
      throw new Error('Budget not found after update');
    }

    return this.mapToEntity(updatedBudget);
  }

  async delete(id: string): Promise<void> {
    await this.budgetRepository.delete(id);
  }

  async getBudgetSummary(budgetId: string): Promise<BudgetSummary | null> {
    const budget = await this.budgetRepository.findOne({ where: { id: budgetId } });
    if (!budget) return null;

    return this.calculateBudgetSummary(budget);
  }

  async getBudgetSummaries(userId: string): Promise<BudgetSummary[]> {
    const budgets = await this.budgetRepository.find({
      where: { userId, isActive: true },
      order: { createdAt: 'DESC' }
    });

    const summaries = await Promise.all(
      budgets.map(budget => this.calculateBudgetSummary(budget))
    );

    return summaries;
  }

  async updateSpentAmount(budgetId: string, spent: number): Promise<void> {
    await this.budgetRepository.update(budgetId, { spent });
  }

  private mapToEntity(budget: Budget): BudgetEntity {
    return {
      id: budget.id,
      name: budget.name,
      amount: budget.amount,
      period: budget.period as any,
      startDate: budget.startDate,
      endDate: budget.endDate,
      categoryIds: budget.categoryIds ? JSON.parse(budget.categoryIds) : undefined,
      isActive: budget.isActive,
      spent: budget.spent,
      description: budget.description,
      userId: budget.userId,
      createdAt: budget.createdAt,
      updatedAt: budget.updatedAt
    };
  }

  private async calculateBudgetSummary(budget: Budget): Promise<BudgetSummary> {
    const remaining = budget.amount - budget.spent;
    const percentageUsed = budget.amount > 0 ? (budget.spent / budget.amount) * 100 : 0;
    const isOverBudget = budget.spent > budget.amount;
    
    const today = new Date();
    const endDate = new Date(budget.endDate);
    const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      id: budget.id,
      name: budget.name,
      amount: budget.amount,
      spent: budget.spent,
      remaining,
      percentageUsed: Math.round(percentageUsed * 100) / 100,
      isOverBudget,
      period: budget.period as any,
      daysRemaining
    };
  }
}