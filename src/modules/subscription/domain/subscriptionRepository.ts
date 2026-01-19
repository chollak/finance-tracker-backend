/**
 * Subscription Repository Interface
 * Defines data access operations for subscriptions
 */

import { Subscription, CreateSubscriptionDTO, UpdateSubscriptionDTO } from './subscription';

export interface SubscriptionRepository {
  /**
   * Find subscription by ID
   */
  findById(id: string): Promise<Subscription | null>;

  /**
   * Find subscription by user ID (any status)
   */
  findByUserId(userId: string): Promise<Subscription | null>;

  /**
   * Find active subscription by user ID
   */
  findActiveByUserId(userId: string): Promise<Subscription | null>;

  /**
   * Create new subscription
   */
  create(dto: CreateSubscriptionDTO): Promise<Subscription>;

  /**
   * Update existing subscription
   */
  update(id: string, dto: UpdateSubscriptionDTO): Promise<Subscription>;

  /**
   * Find subscriptions expiring within N days (for notifications)
   */
  findExpiring(withinDays: number): Promise<Subscription[]>;

  /**
   * Find all expired subscriptions (status still 'active' but endDate passed)
   */
  findExpired(): Promise<Subscription[]>;

  /**
   * Mark subscription as expired
   */
  markAsExpired(id: string): Promise<Subscription>;
}
