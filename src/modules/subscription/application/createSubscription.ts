/**
 * CreateSubscription Use Case
 * Creates a new subscription after payment or grant
 */

import { SubscriptionRepository } from '../domain/subscriptionRepository';
import {
  Subscription,
  CreateSubscriptionDTO,
  SubscriptionTier,
  SubscriptionSource,
} from '../domain/subscription';

export interface CreateSubscriptionInput {
  userId: string;
  tier: SubscriptionTier;
  source: SubscriptionSource;
  priceStars?: number;
  durationDays?: number;
  telegramPaymentChargeId?: string;
  providerPaymentChargeId?: string;
  grantedBy?: string;
  grantNote?: string;
}

export class CreateSubscriptionUseCase {
  constructor(private subscriptionRepository: SubscriptionRepository) {}

  async execute(input: CreateSubscriptionInput): Promise<Subscription> {
    // Check if user already has an active subscription
    const existingActive = await this.subscriptionRepository.findActiveByUserId(input.userId);

    if (existingActive) {
      // If trial is ending and user is paying, mark old as expired
      if (existingActive.source === 'trial' && input.source === 'payment') {
        await this.subscriptionRepository.markAsExpired(existingActive.id);
      } else if (input.source !== 'payment') {
        // For gifts/lifetime, just mark old as expired
        await this.subscriptionRepository.markAsExpired(existingActive.id);
      } else {
        // Extend existing subscription instead of creating new
        // For now, just create new subscription
        await this.subscriptionRepository.markAsExpired(existingActive.id);
      }
    }

    const dto: CreateSubscriptionDTO = {
      userId: input.userId,
      tier: input.tier,
      source: input.source,
      priceStars: input.priceStars,
      durationDays: input.durationDays,
      telegramPaymentChargeId: input.telegramPaymentChargeId,
      providerPaymentChargeId: input.providerPaymentChargeId,
      grantedBy: input.grantedBy,
      grantNote: input.grantNote,
    };

    return this.subscriptionRepository.create(dto);
  }
}
