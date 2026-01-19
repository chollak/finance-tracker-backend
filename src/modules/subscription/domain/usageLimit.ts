/**
 * UsageLimit Entity
 * Tracks user's usage for free tier limits
 */

export type LimitType = 'transactions' | 'voice_inputs' | 'debts';

export interface UsageLimit {
  id: string;
  userId: string;

  // Period tracking (monthly reset)
  periodStart: Date;
  periodEnd: Date;

  // Usage counters
  transactionsCount: number; // Current month transactions
  voiceInputsCount: number; // Current month voice inputs
  activeDebtsCount: number; // Current active debts (not monthly, but total)

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Free tier limits
 */
export const FREE_TIER_LIMITS = {
  transactions: 50, // per month
  voiceInputs: 10, // per month
  activeDebts: 5, // total active at any time
} as const;

/**
 * Result of checking a limit
 */
export interface CheckLimitResult {
  allowed: boolean;
  limitType: LimitType;
  current: number;
  limit: number;
  remaining: number;
  isPremium: boolean;
}

/**
 * DTO for creating usage limit record
 */
export interface CreateUsageLimitDTO {
  userId: string;
  periodStart?: Date;
  periodEnd?: Date;
}

/**
 * Get current month period dates
 */
export function getCurrentMonthPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Check if period has expired and needs reset
 */
export function isPeriodExpired(periodEnd: Date): boolean {
  return new Date() > periodEnd;
}
