/**
 * GrantPremium Use Case
 * Grants premium access to a user (by admin)
 */

import { SubscriptionRepository } from '../domain/subscriptionRepository';
import { Subscription } from '../domain/subscription';
import { GrantTargets } from '../domain/grantTargets';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { NotFoundError } from '../../../shared/domain/errors/AppError';

export interface GrantPremiumInput {
  userId: string;
  /** Telegram id of the admin who signed in (#320) */
  grantedBy: string;
  grantNote?: string;
  isLifetime: boolean;
  durationDays?: number; // For non-lifetime gifts
}

export class GrantPremiumUseCase {
  constructor(
    private subscriptionRepository: SubscriptionRepository,
    private grantTargets: GrantTargets
  ) {}

  /** A NotFoundError for an id no user has (#230): no subscription is made and none expires. */
  async execute(input: GrantPremiumInput): Promise<Result<Subscription>> {
    const { userId, grantedBy, grantNote, isLifetime, durationDays } = input;

    if (!(await this.grantTargets.exists(userId))) {
      return ResultHelper.failure(new NotFoundError('User', userId));
    }

    // Mark any existing active subscription as expired
    const existingActive = await this.subscriptionRepository.findActiveByUserId(userId);
    if (existingActive) {
      await this.subscriptionRepository.markAsExpired(existingActive.id);
    }

    // Create new gift/lifetime subscription
    const subscription = await this.subscriptionRepository.create({
      userId,
      tier: 'premium',
      source: isLifetime ? 'lifetime' : 'gift',
      priceStars: 0, // Gift is free
      durationDays: isLifetime ? undefined : (durationDays || 30),
      grantedBy,
      grantNote,
    });
    return ResultHelper.success(subscription);
  }
}
