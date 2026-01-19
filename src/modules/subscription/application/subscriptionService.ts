/**
 * SubscriptionService
 * Aggregates subscription-related operations for convenience
 */

import { SubscriptionRepository } from '../domain/subscriptionRepository';
import { UsageLimitRepository } from '../domain/usageLimitRepository';
import { Subscription, isSubscriptionActive, FREE_TIER_LIMITS } from '../domain/subscription';
import { LimitType } from '../domain/usageLimit';

export class SubscriptionService {
  constructor(
    private subscriptionRepository: SubscriptionRepository,
    private usageLimitRepository: UsageLimitRepository
  ) {}

  /**
   * Check if user has premium access
   */
  async isPremium(userId: string): Promise<boolean> {
    const subscription = await this.subscriptionRepository.findActiveByUserId(userId);
    return subscription !== null &&
      isSubscriptionActive(subscription) &&
      subscription.tier === 'premium';
  }

  /**
   * Check if user can perform an action (quick check without full details)
   */
  async canPerformAction(userId: string, limitType: LimitType): Promise<boolean> {
    const isPremiumUser = await this.isPremium(userId);
    if (isPremiumUser) return true;

    const usageLimit = await this.usageLimitRepository.findOrCreateForCurrentPeriod(userId);
    const limit = this.getLimit(limitType);
    const currentUsage = this.getCurrentUsage(usageLimit, limitType);

    return currentUsage < limit;
  }

  /**
   * Get remaining usage for a limit type
   */
  async getRemainingUsage(userId: string, limitType: LimitType): Promise<number | null> {
    const isPremiumUser = await this.isPremium(userId);
    if (isPremiumUser) return null; // null means unlimited

    const usageLimit = await this.usageLimitRepository.findOrCreateForCurrentPeriod(userId);
    const limit = this.getLimit(limitType);
    const currentUsage = this.getCurrentUsage(usageLimit, limitType);

    return Math.max(0, limit - currentUsage);
  }

  /**
   * Process expired subscriptions (called by cron job)
   */
  async processExpiredSubscriptions(): Promise<number> {
    const expired = await this.subscriptionRepository.findExpired();
    let processed = 0;

    for (const subscription of expired) {
      try {
        await this.subscriptionRepository.markAsExpired(subscription.id);
        processed++;
      } catch (error) {
        console.error(`Failed to expire subscription ${subscription.id}:`, error);
      }
    }

    return processed;
  }

  /**
   * Get subscriptions expiring soon (for notifications)
   */
  async getExpiringSubscriptions(withinDays: number = 3): Promise<Subscription[]> {
    return this.subscriptionRepository.findExpiring(withinDays);
  }

  private getLimit(limitType: LimitType): number {
    switch (limitType) {
      case 'transactions':
        return FREE_TIER_LIMITS.transactions;
      case 'voice_inputs':
        return FREE_TIER_LIMITS.voiceInputs;
      case 'debts':
        return FREE_TIER_LIMITS.activeDebts;
    }
  }

  private getCurrentUsage(
    usageLimit: { transactionsCount: number; voiceInputsCount: number; activeDebtsCount: number },
    limitType: LimitType
  ): number {
    switch (limitType) {
      case 'transactions':
        return usageLimit.transactionsCount;
      case 'voice_inputs':
        return usageLimit.voiceInputsCount;
      case 'debts':
        return usageLimit.activeDebtsCount;
    }
  }
}
