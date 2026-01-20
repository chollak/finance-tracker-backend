/**
 * Subscription status and usage limits types
 */

export interface UsageLimit {
  used: number;
  limit: number | null; // null for premium (unlimited)
  remaining: number | null;
}

export interface SubscriptionLimits {
  transactions: UsageLimit;
  voiceInputs: UsageLimit;
  activeDebts: UsageLimit;
}

export interface SubscriptionStatus {
  isPremium: boolean;
  isTrialActive: boolean;
  trialDaysLeft: number | null;
  subscriptionDaysLeft: number | null;
  limits: SubscriptionLimits;
}
