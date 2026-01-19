/**
 * Supabase UsageLimit Repository Implementation
 */

import { getSupabaseClient } from '../../../shared/infrastructure/database/supabase.config';
import { UsageLimitRepository } from '../domain/usageLimitRepository';
import {
  UsageLimit,
  CreateUsageLimitDTO,
  LimitType,
  getCurrentMonthPeriod,
  isPeriodExpired,
} from '../domain/usageLimit';

export class SupabaseUsageLimitRepository implements UsageLimitRepository {
  private supabase = getSupabaseClient();

  async findByUserId(userId: string): Promise<UsageLimit | null> {
    const { data, error } = await this.supabase
      .from('usage_limits')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) return null;
    return this.mapToUsageLimit(data);
  }

  async findOrCreateForCurrentPeriod(userId: string): Promise<UsageLimit> {
    const existing = await this.findByUserId(userId);

    if (existing) {
      if (isPeriodExpired(existing.periodEnd)) {
        return this.resetMonthlyCounters(userId);
      }
      return existing;
    }

    return this.create({ userId });
  }

  async create(dto: CreateUsageLimitDTO): Promise<UsageLimit> {
    const period = getCurrentMonthPeriod();

    const insertData = {
      user_id: dto.userId,
      period_start: (dto.periodStart || period.start).toISOString(),
      period_end: (dto.periodEnd || period.end).toISOString(),
      transactions_count: 0,
      voice_inputs_count: 0,
      active_debts_count: 0,
    };

    const { data, error } = await this.supabase
      .from('usage_limits')
      .insert(insertData)
      .select()
      .single();

    if (error) throw new Error(`Failed to create usage limit: ${error.message}`);
    return this.mapToUsageLimit(data);
  }

  async incrementCounter(userId: string, limitType: LimitType): Promise<UsageLimit> {
    const usageLimit = await this.findOrCreateForCurrentPeriod(userId);

    let columnName: string;
    let newValue: number;

    switch (limitType) {
      case 'transactions':
        columnName = 'transactions_count';
        newValue = usageLimit.transactionsCount + 1;
        break;
      case 'voice_inputs':
        columnName = 'voice_inputs_count';
        newValue = usageLimit.voiceInputsCount + 1;
        break;
      case 'debts':
        columnName = 'active_debts_count';
        newValue = usageLimit.activeDebtsCount + 1;
        break;
    }

    const { data, error } = await this.supabase
      .from('usage_limits')
      .update({ [columnName]: newValue })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw new Error(`Failed to increment counter: ${error.message}`);
    return this.mapToUsageLimit(data);
  }

  async decrementCounter(userId: string, limitType: LimitType): Promise<UsageLimit> {
    const usageLimit = await this.findOrCreateForCurrentPeriod(userId);

    let columnName: string;
    let newValue: number;

    switch (limitType) {
      case 'transactions':
        columnName = 'transactions_count';
        newValue = Math.max(0, usageLimit.transactionsCount - 1);
        break;
      case 'voice_inputs':
        columnName = 'voice_inputs_count';
        newValue = Math.max(0, usageLimit.voiceInputsCount - 1);
        break;
      case 'debts':
        columnName = 'active_debts_count';
        newValue = Math.max(0, usageLimit.activeDebtsCount - 1);
        break;
    }

    const { data, error } = await this.supabase
      .from('usage_limits')
      .update({ [columnName]: newValue })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw new Error(`Failed to decrement counter: ${error.message}`);
    return this.mapToUsageLimit(data);
  }

  async setActiveDebtsCount(userId: string, count: number): Promise<UsageLimit> {
    await this.findOrCreateForCurrentPeriod(userId);

    const { data, error } = await this.supabase
      .from('usage_limits')
      .update({ active_debts_count: Math.max(0, count) })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw new Error(`Failed to set debts count: ${error.message}`);
    return this.mapToUsageLimit(data);
  }

  async resetMonthlyCounters(userId: string): Promise<UsageLimit> {
    const existing = await this.findByUserId(userId);
    const period = getCurrentMonthPeriod();

    if (existing) {
      const { data, error } = await this.supabase
        .from('usage_limits')
        .update({
          period_start: period.start.toISOString(),
          period_end: period.end.toISOString(),
          transactions_count: 0,
          voice_inputs_count: 0,
          // Note: active_debts_count is NOT reset
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw new Error(`Failed to reset counters: ${error.message}`);
      return this.mapToUsageLimit(data);
    }

    return this.create({ userId });
  }

  private mapToUsageLimit(data: Record<string, unknown>): UsageLimit {
    return {
      id: data.id as string,
      userId: data.user_id as string,
      periodStart: new Date(data.period_start as string),
      periodEnd: new Date(data.period_end as string),
      transactionsCount: data.transactions_count as number,
      voiceInputsCount: data.voice_inputs_count as number,
      activeDebtsCount: data.active_debts_count as number,
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
    };
  }
}
