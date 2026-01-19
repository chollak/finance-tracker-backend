/**
 * Subscription Entity
 * Represents user's subscription status and payment info
 */

export type SubscriptionTier = 'free' | 'premium';
export type SubscriptionSource = 'payment' | 'trial' | 'gift' | 'lifetime';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled';

export interface Subscription {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  source: SubscriptionSource;
  status: SubscriptionStatus;

  // Billing
  priceStars: number;
  currency: 'XTR';

  // Dates
  startDate: Date;
  endDate: Date | null; // null for lifetime
  trialEndsAt: Date | null;

  // Telegram Payment Info (CRITICAL: needed for refunds)
  telegramPaymentChargeId: string | null;
  providerPaymentChargeId: string | null;

  // Auto-renewal (Telegram handles this automatically)
  autoRenew: boolean;

  // Admin metadata
  grantedBy: string | null; // Admin userId who granted premium
  grantNote: string | null; // Note for gift/lifetime (e.g., "Beta tester")

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

export interface CreateSubscriptionDTO {
  userId: string;
  tier: SubscriptionTier;
  source: SubscriptionSource;
  priceStars?: number;
  durationDays?: number; // 30 for monthly, undefined for lifetime
  telegramPaymentChargeId?: string;
  providerPaymentChargeId?: string;
  grantedBy?: string;
  grantNote?: string;
}

export interface UpdateSubscriptionDTO {
  status?: SubscriptionStatus;
  endDate?: Date | null;
  autoRenew?: boolean;
  cancelledAt?: Date;
  cancellationReason?: string;
}

/**
 * Default subscription price in Telegram Stars
 */
export const SUBSCRIPTION_PRICE_STARS = 100;

/**
 * Default trial duration in days
 */
export const TRIAL_DURATION_DAYS = 14;

/**
 * Monthly subscription duration in days
 */
export const MONTHLY_DURATION_DAYS = 30;

/**
 * Free tier limits (re-exported from usageLimit for convenience)
 */
export { FREE_TIER_LIMITS } from './usageLimit';

/**
 * Check if subscription is currently active
 */
export function isSubscriptionActive(subscription: Subscription): boolean {
  if (subscription.status !== 'active') {
    return false;
  }

  // Lifetime subscriptions never expire
  if (subscription.source === 'lifetime') {
    return true;
  }

  // Check end date
  if (subscription.endDate && subscription.endDate < new Date()) {
    return false;
  }

  return true;
}
