/**
 * UsageLimit Repository Interface
 * Defines data access operations for usage tracking
 */

import { UsageLimit, CreateUsageLimitDTO, LimitType } from './usageLimit';

export interface UsageLimitRepository {
  /**
   * Find usage limit by user ID
   */
  findByUserId(userId: string): Promise<UsageLimit | null>;

  /**
   * Find or create usage limit for current period
   * Automatically resets counters if period expired
   */
  findOrCreateForCurrentPeriod(userId: string): Promise<UsageLimit>;

  /**
   * Create new usage limit record
   */
  create(dto: CreateUsageLimitDTO): Promise<UsageLimit>;

  /**
   * Increment a specific counter
   */
  incrementCounter(userId: string, limitType: LimitType): Promise<UsageLimit>;

  /**
   * Decrement a specific counter (e.g., when deleting a debt)
   */
  decrementCounter(userId: string, limitType: LimitType): Promise<UsageLimit>;

  /**
   * Set active debts count directly (not monthly, but current state)
   */
  setActiveDebtsCount(userId: string, count: number): Promise<UsageLimit>;

  /**
   * Reset monthly counters (transactions and voice_inputs)
   * Called when period expires or subscription changes
   */
  resetMonthlyCounters(userId: string): Promise<UsageLimit>;
}
