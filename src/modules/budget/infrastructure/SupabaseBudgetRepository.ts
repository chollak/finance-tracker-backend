import { getSupabaseClient } from '../../../shared/infrastructure/database/supabase.config';
import { BudgetRepository } from '../domain/budgetRepository';
import { BudgetEntity, CreateBudgetData, UpdateBudgetData, BudgetSummary } from '../domain/budgetEntity';

export class SupabaseBudgetRepository implements BudgetRepository {
  private supabase = getSupabaseClient();

  async create(budgetData: CreateBudgetData): Promise<BudgetEntity> {
    const insertData = {
      name: budgetData.name,
      amount: budgetData.amount,
      period: budgetData.period,
      start_date: budgetData.startDate,
      end_date: budgetData.endDate,
      user_id: budgetData.userId,
      description: budgetData.description,
      category_ids: budgetData.categoryIds ? JSON.stringify(budgetData.categoryIds) : undefined,
      spent: 0,
      is_active: true
    };

    const { data, error } = await this.supabase
      .from('budgets')
      .insert(insertData)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create budget: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data returned from budget insert');
    }

    return this.mapToEntity(data);
  }

  async getById(id: string): Promise<BudgetEntity | null> {
    const { data, error } = await this.supabase
      .from('budgets')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      throw new Error(`Failed to find budget by id: ${error.message}`);
    }

    return data ? this.mapToEntity(data) : null;
  }

  async getByUserId(userId: string): Promise<BudgetEntity[]> {
    const { data, error } = await this.supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get budgets by user id: ${error.message}`);
    }

    return (data || []).map(row => this.mapToEntity(row));
  }

  async getActiveBudgetsByUserId(userId: string): Promise<BudgetEntity[]> {
    const { data, error } = await this.supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get active budgets by user id: ${error.message}`);
    }

    return (data || []).map(row => this.mapToEntity(row));
  }

  async update(id: string, updateData: UpdateBudgetData): Promise<BudgetEntity> {
    const updatePayload: any = {};
    
    if (updateData.name !== undefined) updatePayload.name = updateData.name;
    if (updateData.amount !== undefined) updatePayload.amount = updateData.amount;
    if (updateData.period !== undefined) updatePayload.period = updateData.period;
    if (updateData.startDate !== undefined) updatePayload.start_date = updateData.startDate;
    if (updateData.endDate !== undefined) updatePayload.end_date = updateData.endDate;
    if (updateData.description !== undefined) updatePayload.description = updateData.description;
    if (updateData.isActive !== undefined) updatePayload.is_active = updateData.isActive;
    if (updateData.categoryIds !== undefined) {
      updatePayload.category_ids = updateData.categoryIds ? JSON.stringify(updateData.categoryIds) : undefined;
    }

    const { data, error } = await this.supabase
      .from('budgets')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update budget: ${error.message}`);
    }

    if (!data) {
      throw new Error('Budget not found after update');
    }

    return this.mapToEntity(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('budgets')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete budget: ${error.message}`);
    }
  }

  async getBudgetSummary(budgetId: string): Promise<BudgetSummary | null> {
    const { data, error } = await this.supabase
      .from('budgets')
      .select('*')
      .eq('id', budgetId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get budget summary: ${error.message}`);
    }

    if (!data) return null;

    return this.calculateBudgetSummary(data);
  }

  async getBudgetSummaries(userId: string): Promise<BudgetSummary[]> {
    const { data, error } = await this.supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get budget summaries: ${error.message}`);
    }

    const summaries = (data || []).map(budget => this.calculateBudgetSummary(budget));
    return summaries;
  }

  async updateSpentAmount(budgetId: string, spent: number): Promise<void> {
    const { error } = await this.supabase
      .from('budgets')
      .update({ spent })
      .eq('id', budgetId);

    if (error) {
      throw new Error(`Failed to update spent amount: ${error.message}`);
    }
  }

  private mapToEntity(row: any): BudgetEntity {
    return {
      id: row.id,
      name: row.name,
      amount: Number(row.amount),
      period: row.period as any,
      startDate: row.start_date,
      endDate: row.end_date,
      categoryIds: row.category_ids ? JSON.parse(row.category_ids) : undefined,
      isActive: row.is_active,
      spent: Number(row.spent),
      description: row.description || undefined,
      userId: row.user_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private calculateBudgetSummary(row: any): BudgetSummary {
    const amount = Number(row.amount);
    const spent = Number(row.spent);
    const remaining = amount - spent;
    const percentageUsed = amount > 0 ? (spent / amount) * 100 : 0;
    const isOverBudget = spent > amount;
    
    const today = new Date();
    const endDate = new Date(row.end_date);
    const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      id: row.id,
      name: row.name,
      amount,
      spent,
      remaining,
      percentageUsed: Math.round(percentageUsed * 100) / 100,
      isOverBudget,
      period: row.period as any,
      daysRemaining
    };
  }
}