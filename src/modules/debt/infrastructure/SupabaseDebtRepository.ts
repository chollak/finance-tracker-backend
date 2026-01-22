import { getSupabaseClient } from '../../../shared/infrastructure/database/supabase.config';
import { DebtRepository } from '../domain/debtRepository';
import {
  DebtEntity,
  DebtPaymentEntity,
  CreateDebtData,
  UpdateDebtData,
  PayDebtData,
  DebtSummary,
  DebtWithPayments,
  DebtStatus,
  DebtType
} from '../domain/debtEntity';

export class SupabaseDebtRepository implements DebtRepository {
  private supabase = getSupabaseClient();

  async create(data: CreateDebtData): Promise<DebtEntity> {
    const insertData = {
      user_id: data.userId,
      type: data.type,
      person_name: data.personName,
      original_amount: data.amount,
      remaining_amount: data.amount,
      currency: data.currency || 'UZS',
      description: data.description,
      due_date: data.dueDate,
      status: DebtStatus.ACTIVE
    };

    const { data: debt, error } = await this.supabase
      .from('debts')
      .insert(insertData)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create debt: ${error.message}`);
    }

    return this.mapToEntity(debt);
  }

  async findById(id: string): Promise<DebtEntity | null> {
    const { data, error } = await this.supabase
      .from('debts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to find debt: ${error.message}`);
    }

    return data ? this.mapToEntity(data) : null;
  }

  async findByUserId(userId: string, status?: DebtStatus): Promise<DebtEntity[]> {
    let query = this.supabase
      .from('debts')
      .select('*')
      .eq('user_id', userId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to find debts: ${error.message}`);
    }

    return (data || []).map(row => this.mapToEntity(row));
  }

  async findByType(userId: string, type: DebtType): Promise<DebtEntity[]> {
    const { data, error } = await this.supabase
      .from('debts')
      .select('*')
      .eq('user_id', userId)
      .eq('type', type)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to find debts by type: ${error.message}`);
    }

    return (data || []).map(row => this.mapToEntity(row));
  }

  async update(id: string, data: UpdateDebtData): Promise<DebtEntity> {
    const updatePayload: any = {};

    if (data.personName !== undefined) updatePayload.person_name = data.personName;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.dueDate !== undefined) updatePayload.due_date = data.dueDate;
    if (data.status !== undefined) updatePayload.status = data.status;

    const { data: debt, error } = await this.supabase
      .from('debts')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update debt: ${error.message}`);
    }

    return this.mapToEntity(debt);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('debts')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete debt: ${error.message}`);
    }
  }

  async findWithPayments(id: string): Promise<DebtWithPayments | null> {
    const { data: debt, error: debtError } = await this.supabase
      .from('debts')
      .select('*')
      .eq('id', id)
      .single();

    if (debtError) {
      if (debtError.code === 'PGRST116') return null;
      throw new Error(`Failed to find debt: ${debtError.message}`);
    }

    const { data: payments, error: paymentsError } = await this.supabase
      .from('debt_payments')
      .select('*')
      .eq('debt_id', id)
      .order('paid_at', { ascending: false });

    if (paymentsError) {
      throw new Error(`Failed to find payments: ${paymentsError.message}`);
    }

    return {
      ...this.mapToEntity(debt),
      payments: (payments || []).map(p => this.mapPaymentToEntity(p))
    };
  }

  async addPayment(data: PayDebtData): Promise<DebtPaymentEntity> {
    // Get current debt
    const { data: debt, error: debtError } = await this.supabase
      .from('debts')
      .select('remaining_amount')
      .eq('id', data.debtId)
      .single();

    if (debtError) {
      throw new Error(`Failed to get debt: ${debtError.message}`);
    }

    // Create payment
    const { data: payment, error: paymentError } = await this.supabase
      .from('debt_payments')
      .insert({
        debt_id: data.debtId,
        amount: data.amount,
        note: data.note,
        paid_at: new Date().toISOString()
      })
      .select('*')
      .single();

    if (paymentError) {
      throw new Error(`Failed to add payment: ${paymentError.message}`);
    }

    // Update remaining amount
    const newRemaining = Number(debt.remaining_amount) - data.amount;
    const updateData: any = {
      remaining_amount: Math.max(0, newRemaining)
    };

    if (newRemaining <= 0) {
      updateData.status = DebtStatus.PAID;
    }

    await this.supabase
      .from('debts')
      .update(updateData)
      .eq('id', data.debtId);

    return this.mapPaymentToEntity(payment);
  }

  async findPaymentById(paymentId: string): Promise<DebtPaymentEntity | null> {
    const { data, error } = await this.supabase
      .from('debt_payments')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to find payment: ${error.message}`);
    }

    return data ? this.mapPaymentToEntity(data) : null;
  }

  async findPaymentsByDebtId(debtId: string): Promise<DebtPaymentEntity[]> {
    const { data, error } = await this.supabase
      .from('debt_payments')
      .select('*')
      .eq('debt_id', debtId)
      .order('paid_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to find payments: ${error.message}`);
    }

    return (data || []).map(p => this.mapPaymentToEntity(p));
  }

  async deletePayment(paymentId: string): Promise<void> {
    // Get payment to restore amount
    const { data: payment, error: getError } = await this.supabase
      .from('debt_payments')
      .select('debt_id, amount')
      .eq('id', paymentId)
      .single();

    if (getError) {
      throw new Error(`Failed to get payment: ${getError.message}`);
    }

    // Get current debt
    const { data: debt } = await this.supabase
      .from('debts')
      .select('remaining_amount')
      .eq('id', payment.debt_id)
      .single();

    if (debt) {
      // Restore amount
      await this.supabase
        .from('debts')
        .update({
          remaining_amount: Number(debt.remaining_amount) + Number(payment.amount),
          status: DebtStatus.ACTIVE
        })
        .eq('id', payment.debt_id);
    }

    // Delete payment
    const { error } = await this.supabase
      .from('debt_payments')
      .delete()
      .eq('id', paymentId);

    if (error) {
      throw new Error(`Failed to delete payment: ${error.message}`);
    }
  }

  async getSummary(userId: string): Promise<DebtSummary> {
    const { data: debts, error } = await this.supabase
      .from('debts')
      .select('type, remaining_amount')
      .eq('user_id', userId)
      .eq('status', DebtStatus.ACTIVE);

    if (error) {
      throw new Error(`Failed to get summary: ${error.message}`);
    }

    let totalIOwe = 0;
    let totalOwedToMe = 0;
    let iOweCount = 0;
    let owedToMeCount = 0;

    for (const debt of debts || []) {
      if (debt.type === DebtType.I_OWE) {
        totalIOwe += Number(debt.remaining_amount);
        iOweCount++;
      } else {
        totalOwedToMe += Number(debt.remaining_amount);
        owedToMeCount++;
      }
    }

    return {
      totalIOwe,
      totalOwedToMe,
      netBalance: totalOwedToMe - totalIOwe,
      activeDebtsCount: (debts || []).length,
      iOweCount,
      owedToMeCount,
      currency: 'UZS'
    };
  }

  async updateRemainingAmount(debtId: string, amount: number): Promise<void> {
    const { error } = await this.supabase
      .from('debts')
      .update({ remaining_amount: amount })
      .eq('id', debtId);

    if (error) {
      throw new Error(`Failed to update remaining amount: ${error.message}`);
    }
  }

  async markAsPaid(debtId: string): Promise<void> {
    const { error } = await this.supabase
      .from('debts')
      .update({
        status: DebtStatus.PAID,
        remaining_amount: 0
      })
      .eq('id', debtId);

    if (error) {
      throw new Error(`Failed to mark as paid: ${error.message}`);
    }
  }

  private mapToEntity(row: any): DebtEntity {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type as DebtType,
      personName: row.person_name,
      originalAmount: Number(row.original_amount),
      remainingAmount: Number(row.remaining_amount),
      currency: row.currency,
      description: row.description || undefined,
      status: row.status as DebtStatus,
      dueDate: row.due_date || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private mapPaymentToEntity(row: any): DebtPaymentEntity {
    return {
      id: row.id,
      debtId: row.debt_id,
      amount: Number(row.amount),
      note: row.note || undefined,
      paidAt: new Date(row.paid_at),
      createdAt: new Date(row.created_at)
    };
  }
}
