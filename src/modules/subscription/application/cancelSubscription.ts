/**
 * CancelSubscription Use Case
 * Cancels an active subscription
 */

import { SubscriptionRepository } from '../domain/subscriptionRepository';
import { Subscription } from '../domain/subscription';

export interface CancelSubscriptionInput {
  userId: string;
  reason?: string;
}

export interface CancelSubscriptionResult {
  success: boolean;
  subscription: Subscription | null;
  message: string;
}

export class CancelSubscriptionUseCase {
  constructor(private subscriptionRepository: SubscriptionRepository) {}

  async execute(input: CancelSubscriptionInput): Promise<CancelSubscriptionResult> {
    const { userId, reason } = input;

    const subscription = await this.subscriptionRepository.findActiveByUserId(userId);

    if (!subscription) {
      return {
        success: false,
        subscription: null,
        message: 'Активная подписка не найдена',
      };
    }

    // Lifetime subscriptions cannot be cancelled
    if (subscription.source === 'lifetime') {
      return {
        success: false,
        subscription,
        message: 'Пожизненную подписку нельзя отменить',
      };
    }

    // Gift subscriptions cannot be cancelled
    if (subscription.source === 'gift') {
      return {
        success: false,
        subscription,
        message: 'Подарочную подписку нельзя отменить',
      };
    }

    // Cancel the subscription
    const updated = await this.subscriptionRepository.update(subscription.id, {
      status: 'cancelled',
      autoRenew: false,
      cancelledAt: new Date(),
      cancellationReason: reason,
    });

    return {
      success: true,
      subscription: updated,
      message: 'Подписка отменена. Доступ сохранится до конца оплаченного периода.',
    };
  }
}
