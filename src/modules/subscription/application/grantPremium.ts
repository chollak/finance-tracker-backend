/**
 * GrantPremium Use Case
 * Grants premium access to a user (by admin)
 */

import { SubscriptionRepository } from '../domain/subscriptionRepository';
import { Subscription, SUBSCRIPTION_PRICE_STARS } from '../domain/subscription';

export interface GrantPremiumInput {
  userId: string;
  grantedBy: string;
  grantNote?: string;
  isLifetime: boolean;
  durationDays?: number; // For non-lifetime gifts
}

export class GrantPremiumUseCase {
  constructor(private subscriptionRepository: SubscriptionRepository) {}

  async execute(input: GrantPremiumInput): Promise<Subscription> {
    const { userId, grantedBy, grantNote, isLifetime, durationDays } = input;

    // Mark any existing active subscription as expired
    const existingActive = await this.subscriptionRepository.findActiveByUserId(userId);
    if (existingActive) {
      await this.subscriptionRepository.markAsExpired(existingActive.id);
    }

    // Create new gift/lifetime subscription
    return this.subscriptionRepository.create({
      userId,
      tier: 'premium',
      source: isLifetime ? 'lifetime' : 'gift',
      priceStars: 0, // Gift is free
      durationDays: isLifetime ? undefined : (durationDays || 30),
      grantedBy,
      grantNote,
    });
  }
}

/**
 * StartTrial Use Case
 * Starts a trial subscription for a new user
 */
export interface StartTrialInput {
  userId: string;
}

export class StartTrialUseCase {
  constructor(private subscriptionRepository: SubscriptionRepository) {}

  async execute(input: StartTrialInput): Promise<Subscription | null> {
    const { userId } = input;

    // Check if user already has any subscription history
    const existingSubscription = await this.subscriptionRepository.findByUserId(userId);
    if (existingSubscription) {
      // User already had a subscription (trial or paid), don't give another trial
      return null;
    }

    // Create trial subscription
    return this.subscriptionRepository.create({
      userId,
      tier: 'premium',
      source: 'trial',
      priceStars: 0,
    });
  }
}
