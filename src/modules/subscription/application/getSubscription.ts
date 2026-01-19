/**
 * GetSubscription Use Case
 * Gets current subscription status for a user
 */

import { SubscriptionRepository } from '../domain/subscriptionRepository';
import { UsageLimitRepository } from '../domain/usageLimitRepository';
import {
  Subscription,
  isSubscriptionActive,
  FREE_TIER_LIMITS,
} from '../domain/subscription';
import { UsageLimit } from '../domain/usageLimit';

export interface SubscriptionStatus {
  subscription: Subscription | null;
  usageLimit: UsageLimit;
  isPremium: boolean;
  isTrialActive: boolean;
  trialDaysLeft: number | null;
  subscriptionDaysLeft: number | null;
  limits: {
    transactions: { used: number; limit: number | null; remaining: number | null };
    voiceInputs: { used: number; limit: number | null; remaining: number | null };
    activeDebts: { used: number; limit: number | null; remaining: number | null };
  };
}

export class GetSubscriptionUseCase {
  constructor(
    private subscriptionRepository: SubscriptionRepository,
    private usageLimitRepository: UsageLimitRepository
  ) {}

  async execute(userId: string): Promise<SubscriptionStatus> {
    const [subscription, usageLimit] = await Promise.all([
      this.subscriptionRepository.findActiveByUserId(userId),
      this.usageLimitRepository.findOrCreateForCurrentPeriod(userId),
    ]);

    const isPremium = subscription !== null &&
      isSubscriptionActive(subscription) &&
      subscription.tier === 'premium';

    const isTrialActive = subscription !== null &&
      isSubscriptionActive(subscription) &&
      subscription.source === 'trial';

    const trialDaysLeft = this.calculateDaysLeft(subscription?.trialEndsAt);
    const subscriptionDaysLeft = this.calculateDaysLeft(subscription?.endDate);

    // Calculate limits based on tier
    const txLimit = isPremium ? null : FREE_TIER_LIMITS.transactions;
    const voiceLimit = isPremium ? null : FREE_TIER_LIMITS.voiceInputs;
    const debtLimit = isPremium ? null : FREE_TIER_LIMITS.activeDebts;

    return {
      subscription,
      usageLimit,
      isPremium,
      isTrialActive,
      trialDaysLeft,
      subscriptionDaysLeft,
      limits: {
        transactions: {
          used: usageLimit.transactionsCount,
          limit: txLimit,
          remaining: txLimit !== null ? Math.max(0, txLimit - usageLimit.transactionsCount) : null,
        },
        voiceInputs: {
          used: usageLimit.voiceInputsCount,
          limit: voiceLimit,
          remaining: voiceLimit !== null ? Math.max(0, voiceLimit - usageLimit.voiceInputsCount) : null,
        },
        activeDebts: {
          used: usageLimit.activeDebtsCount,
          limit: debtLimit,
          remaining: debtLimit !== null ? Math.max(0, debtLimit - usageLimit.activeDebtsCount) : null,
        },
      },
    };
  }

  private calculateDaysLeft(date: Date | null | undefined): number | null {
    if (!date) return null;
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    if (diff <= 0) return 0;
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
  }
}
