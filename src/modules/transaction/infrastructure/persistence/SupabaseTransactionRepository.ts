import { getSupabaseClient } from '../../../../shared/infrastructure/database/supabase.config';
import { TransactionRepository } from '../../domain/transactionRepository';
import { Transaction } from '../../domain/transactionEntity';

export class SupabaseTransactionRepository implements TransactionRepository {
  private supabase = getSupabaseClient();

  async save(transaction: Transaction): Promise<string> {
    const insertData = {
      amount: transaction.amount,
      type: transaction.type,
      description: transaction.description,
      date: transaction.date,
      merchant: transaction.merchant,
      confidence: transaction.confidence,
      original_text: transaction.originalText,
      original_parsing: transaction.originalParsing ? JSON.stringify(transaction.originalParsing) : undefined,
      user_id: transaction.userId,
      category: transaction.category || 'Другое'
    };

    const { data, error } = await this.supabase
      .from('transactions')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to save transaction: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data returned from transaction insert');
    }

    return data.id;
  }

  async getAll(): Promise<Transaction[]> {
    const { data, error } = await this.supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get all transactions: ${error.message}`);
    }

    return (data || []).map(row => this.mapToTransaction(row));
  }

  async findById(id: string): Promise<Transaction | null> {
    const { data, error } = await this.supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      throw new Error(`Failed to find transaction by id: ${error.message}`);
    }

    return data ? this.mapToTransaction(data) : null;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete transaction: ${error.message}`);
    }
  }

  async update(id: string, updates: Partial<Transaction>): Promise<Transaction> {
    const updateData: any = {};
    
    if (updates.amount !== undefined) updateData.amount = updates.amount;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.date !== undefined) updateData.date = updates.date;
    if (updates.merchant !== undefined) updateData.merchant = updates.merchant;
    if (updates.confidence !== undefined) updateData.confidence = updates.confidence;
    if (updates.category !== undefined) updateData.category = updates.category;

    const { data, error } = await this.supabase
      .from('transactions')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update transaction: ${error.message}`);
    }

    if (!data) {
      throw new Error(`Transaction with id ${id} not found after update`);
    }

    return this.mapToTransaction(data);
  }

  async getByUserIdAndDateRange(userId: string, startDate: Date, endDate: Date): Promise<Transaction[]> {
    const { data, error } = await this.supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (error) {
      throw new Error(`Failed to get transactions by user and date range: ${error.message}`);
    }

    return (data || []).map(row => this.mapToTransaction(row));
  }

  async findByUserId(userId: string, limit?: number): Promise<Transaction[]> {
    let query = this.supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to find transactions by user id: ${error.message}`);
    }

    return (data || []).map(row => this.mapToTransaction(row));
  }

  private mapToTransaction(row: any): Transaction {
    return {
      id: row.id,
      amount: Number(row.amount),
      type: row.type,
      description: row.description,
      date: row.date,
      userId: row.user_id,
      merchant: row.merchant || undefined,
      confidence: row.confidence ? Number(row.confidence) : undefined,
      originalText: row.original_text || undefined,
      originalParsing: row.original_parsing ? JSON.parse(row.original_parsing) : undefined,
      category: row.category || 'Другое',
      userName: undefined // We'll get this from User entity later if needed
    };
  }
}