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
import { createLogger, LogCategory } from '../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.SUBSCRIPTION);

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
    // Ensure record exists first
    await this.findOrCreateForCurrentPeriod(userId);

    const columnName = this.getColumnName(limitType);

    // Try atomic increment via RPC function first
    const { data: rpcData, error: rpcError } = await this.supabase.rpc(
      'increment_usage_counter',
      {
        p_user_id: userId,
        p_column_name: columnName,
      }
    );

    if (!rpcError && rpcData) {
      return this.mapToUsageLimit(rpcData);
    }

    // Fallback: non-atomic update (for backwards compatibility)
    logger.warn('RPC increment_usage_counter not available, using fallback. Consider running migration.');
    const usageLimit = await this.findByUserId(userId);
    if (!usageLimit) {
      throw new Error('UsageLimit not found');
    }

    const newValue = this.getCurrentValue(usageLimit, limitType) + 1;

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
    // Ensure record exists first
    await this.findOrCreateForCurrentPeriod(userId);

    const columnName = this.getColumnName(limitType);

    // Try atomic decrement via RPC function first
    const { data: rpcData, error: rpcError } = await this.supabase.rpc(
      'decrement_usage_counter',
      {
        p_user_id: userId,
        p_column_name: columnName,
      }
    );

    if (!rpcError && rpcData) {
      return this.mapToUsageLimit(rpcData);
    }

    // Fallback: non-atomic update (for backwards compatibility)
    logger.warn('RPC decrement_usage_counter not available, using fallback. Consider running migration.');
    const usageLimit = await this.findByUserId(userId);
    if (!usageLimit) {
      throw new Error('UsageLimit not found');
    }

    const newValue = Math.max(0, this.getCurrentValue(usageLimit, limitType) - 1);

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

  /**
   * Get Supabase column name for limit type
   */
  private getColumnName(limitType: LimitType): string {
    switch (limitType) {
      case 'transactions':
        return 'transactions_count';
      case 'voice_inputs':
        return 'voice_inputs_count';
      case 'debts':
        return 'active_debts_count';
    }
  }

  /**
   * Get current value from UsageLimit for limit type
   */
  private getCurrentValue(usageLimit: UsageLimit, limitType: LimitType): number {
    switch (limitType) {
      case 'transactions':
        return usageLimit.transactionsCount;
      case 'voice_inputs':
        return usageLimit.voiceInputsCount;
      case 'debts':
        return usageLimit.activeDebtsCount;
    }
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
