/**
 * CheckLimit Use Case
 * Checks if user can perform an action based on their tier limits
 */

import { SubscriptionRepository } from '../domain/subscriptionRepository';
import { UsageLimitRepository } from '../domain/usageLimitRepository';
import { LimitType } from '../domain/usageLimit';
import {
  isSubscriptionActive,
  FREE_TIER_LIMITS,
} from '../domain/subscription';

export interface CheckLimitInput {
  userId: string;
  limitType: LimitType;
}

export interface CheckLimitResult {
  allowed: boolean;
  isPremium: boolean;
  currentUsage: number;
  limit: number | null;
  remaining: number | null;
  message?: string;
}

export class CheckLimitUseCase {
  constructor(
    private subscriptionRepository: SubscriptionRepository,
    private usageLimitRepository: UsageLimitRepository
  ) {}

  async execute(input: CheckLimitInput): Promise<CheckLimitResult> {
    const { userId, limitType } = input;

    const [subscription, usageLimit] = await Promise.all([
      this.subscriptionRepository.findActiveByUserId(userId),
      this.usageLimitRepository.findOrCreateForCurrentPeriod(userId),
    ]);

    const isPremium = subscription !== null &&
      isSubscriptionActive(subscription) &&
      subscription.tier === 'premium';

    // Premium users have no limits
    if (isPremium) {
      return {
        allowed: true,
        isPremium: true,
        currentUsage: this.getCurrentUsage(usageLimit, limitType),
        limit: null,
        remaining: null,
      };
    }

    // Free tier - check limits
    const limit = this.getLimit(limitType);
    const currentUsage = this.getCurrentUsage(usageLimit, limitType);
    const remaining = Math.max(0, limit - currentUsage);
    const allowed = currentUsage < limit;

    return {
      allowed,
      isPremium: false,
      currentUsage,
      limit,
      remaining,
      message: allowed
        ? undefined
        : this.getLimitExceededMessage(limitType, limit),
    };
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

  private getLimitExceededMessage(limitType: LimitType, limit: number): string {
    switch (limitType) {
      case 'transactions':
        return `Вы достигли лимита ${limit} транзакций в месяц. Оформите Premium для безлимита! ⭐`;
      case 'voice_inputs':
        return `Вы достигли лимита ${limit} голосовых сообщений в месяц. Оформите Premium для безлимита! ⭐`;
      case 'debts':
        return `Вы достигли лимита ${limit} активных долгов. Оформите Premium для безлимита! ⭐`;
    }
  }
}
