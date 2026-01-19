/**
 * Supabase Subscription Repository Implementation
 */

import { getSupabaseClient } from '../../../shared/infrastructure/database/supabase.config';
import { SubscriptionRepository } from '../domain/subscriptionRepository';
import {
  Subscription,
  CreateSubscriptionDTO,
  UpdateSubscriptionDTO,
  SUBSCRIPTION_PRICE_STARS,
  TRIAL_DURATION_DAYS,
  MONTHLY_DURATION_DAYS,
} from '../domain/subscription';

export class SupabaseSubscriptionRepository implements SubscriptionRepository {
  private supabase = getSupabaseClient();

  async findById(id: string): Promise<Subscription | null> {
    const { data, error } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return this.mapToSubscription(data);
  }

  async findByUserId(userId: string): Promise<Subscription | null> {
    const { data, error } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return this.mapToSubscription(data);
  }

  async findActiveByUserId(userId: string): Promise<Subscription | null> {
    const { data, error } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return this.mapToSubscription(data);
  }

  async create(dto: CreateSubscriptionDTO): Promise<Subscription> {
    const startDate = new Date();
    let endDate: Date | null = null;
    let trialEndsAt: Date | null = null;

    if (dto.source === 'lifetime') {
      endDate = null;
    } else if (dto.source === 'trial') {
      const trialEnd = new Date(startDate.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
      trialEndsAt = trialEnd;
      endDate = trialEnd;
    } else {
      const days = dto.durationDays || MONTHLY_DURATION_DAYS;
      endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
    }

    const insertData = {
      user_id: dto.userId,
      tier: dto.tier,
      source: dto.source,
      status: 'active',
      price_stars: dto.priceStars || SUBSCRIPTION_PRICE_STARS,
      currency: 'XTR',
      start_date: startDate.toISOString(),
      end_date: endDate?.toISOString() || null,
      trial_ends_at: trialEndsAt?.toISOString() || null,
      telegram_payment_charge_id: dto.telegramPaymentChargeId || null,
      provider_payment_charge_id: dto.providerPaymentChargeId || null,
      auto_renew: dto.source === 'payment',
      granted_by: dto.grantedBy || null,
      grant_note: dto.grantNote || null,
    };

    const { data, error } = await this.supabase
      .from('subscriptions')
      .insert(insertData)
      .select()
      .single();

    if (error) throw new Error(`Failed to create subscription: ${error.message}`);
    return this.mapToSubscription(data);
  }

  async update(id: string, dto: UpdateSubscriptionDTO): Promise<Subscription> {
    const updateData: Record<string, unknown> = {};

    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.endDate !== undefined) updateData.end_date = dto.endDate?.toISOString() || null;
    if (dto.autoRenew !== undefined) updateData.auto_renew = dto.autoRenew;
    if (dto.cancelledAt !== undefined) updateData.cancelled_at = dto.cancelledAt.toISOString();
    if (dto.cancellationReason !== undefined) updateData.cancellation_reason = dto.cancellationReason;

    const { data, error } = await this.supabase
      .from('subscriptions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update subscription: ${error.message}`);
    return this.mapToSubscription(data);
  }

  async findExpiring(withinDays: number): Promise<Subscription[]> {
    const now = new Date();
    const futureDate = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

    const { data, error } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('status', 'active')
      .lt('end_date', futureDate.toISOString())
      .gt('end_date', now.toISOString());

    if (error) throw new Error(`Failed to find expiring subscriptions: ${error.message}`);
    return (data || []).map(d => this.mapToSubscription(d));
  }

  async findExpired(): Promise<Subscription[]> {
    const now = new Date();

    const { data, error } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('status', 'active')
      .lt('end_date', now.toISOString());

    if (error) throw new Error(`Failed to find expired subscriptions: ${error.message}`);
    return (data || []).map(d => this.mapToSubscription(d));
  }

  async markAsExpired(id: string): Promise<Subscription> {
    return this.update(id, { status: 'expired' });
  }

  private mapToSubscription(data: Record<string, unknown>): Subscription {
    return {
      id: data.id as string,
      userId: data.user_id as string,
      tier: data.tier as 'free' | 'premium',
      source: data.source as 'payment' | 'trial' | 'gift' | 'lifetime',
      status: data.status as 'active' | 'expired' | 'cancelled',
      priceStars: data.price_stars as number,
      currency: 'XTR',
      startDate: new Date(data.start_date as string),
      endDate: data.end_date ? new Date(data.end_date as string) : null,
      trialEndsAt: data.trial_ends_at ? new Date(data.trial_ends_at as string) : null,
      telegramPaymentChargeId: (data.telegram_payment_charge_id as string) || null,
      providerPaymentChargeId: (data.provider_payment_charge_id as string) || null,
      autoRenew: data.auto_renew as boolean,
      grantedBy: (data.granted_by as string) || null,
      grantNote: (data.grant_note as string) || null,
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
      cancelledAt: data.cancelled_at ? new Date(data.cancelled_at as string) : null,
      cancellationReason: (data.cancellation_reason as string) || null,
    };
  }
}
