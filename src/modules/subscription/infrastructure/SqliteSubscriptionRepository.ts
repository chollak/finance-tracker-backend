/**
 * SQLite Subscription Repository Implementation
 */

import { Repository, LessThan } from 'typeorm';
import { AppDataSource } from '../../../shared/infrastructure/database/database.config';
import { Subscription as SubscriptionEntity } from '../../../shared/infrastructure/database/entities/Subscription';
import {
  SubscriptionRepository,
} from '../domain/subscriptionRepository';
import {
  Subscription,
  CreateSubscriptionDTO,
  UpdateSubscriptionDTO,
  SUBSCRIPTION_PRICE_STARS,
  TRIAL_DURATION_DAYS,
  MONTHLY_DURATION_DAYS,
} from '../domain/subscription';

export class SqliteSubscriptionRepository implements SubscriptionRepository {
  private repository: Repository<SubscriptionEntity>;

  constructor() {
    this.repository = AppDataSource.getRepository(SubscriptionEntity);
  }

  async findById(id: string): Promise<Subscription | null> {
    const entity = await this.repository.findOne({ where: { id } });
    return entity ? this.mapToSubscription(entity) : null;
  }

  async findByUserId(userId: string): Promise<Subscription | null> {
    const entity = await this.repository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return entity ? this.mapToSubscription(entity) : null;
  }

  async findActiveByUserId(userId: string): Promise<Subscription | null> {
    const entity = await this.repository.findOne({
      where: { userId, status: 'active' },
      order: { createdAt: 'DESC' },
    });
    return entity ? this.mapToSubscription(entity) : null;
  }

  async create(dto: CreateSubscriptionDTO): Promise<Subscription> {
    const startDate = new Date();
    let endDate: Date | undefined = undefined;
    let trialEndsAt: Date | undefined = undefined;

    if (dto.source === 'lifetime') {
      endDate = undefined;
    } else if (dto.source === 'trial') {
      const trialEnd = new Date(startDate.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
      trialEndsAt = trialEnd;
      endDate = trialEnd;
    } else {
      const days = dto.durationDays || MONTHLY_DURATION_DAYS;
      endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
    }

    const entity = this.repository.create({
      userId: dto.userId,
      tier: dto.tier,
      source: dto.source,
      status: 'active',
      priceStars: dto.priceStars || SUBSCRIPTION_PRICE_STARS,
      currency: 'XTR',
      startDate,
      endDate,
      trialEndsAt,
      telegramPaymentChargeId: dto.telegramPaymentChargeId,
      providerPaymentChargeId: dto.providerPaymentChargeId,
      autoRenew: dto.source === 'payment',
      grantedBy: dto.grantedBy,
      grantNote: dto.grantNote,
    });

    const saved = await this.repository.save(entity);
    return this.mapToSubscription(saved);
  }

  async update(id: string, dto: UpdateSubscriptionDTO): Promise<Subscription> {
    const updateData: Partial<SubscriptionEntity> = {};

    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.endDate !== undefined) updateData.endDate = dto.endDate ?? undefined;
    if (dto.autoRenew !== undefined) updateData.autoRenew = dto.autoRenew;
    if (dto.cancelledAt !== undefined) updateData.cancelledAt = dto.cancelledAt;
    if (dto.cancellationReason !== undefined) updateData.cancellationReason = dto.cancellationReason;

    await this.repository.update(id, updateData);

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('Subscription not found after update');
    }
    return updated;
  }

  async findExpiring(withinDays: number): Promise<Subscription[]> {
    const now = new Date();
    const futureDate = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

    const entities = await this.repository.find({
      where: {
        status: 'active',
        endDate: LessThan(futureDate),
      },
    });

    return entities
      .filter(e => e.endDate && e.endDate > now) // Only future expirations
      .map(e => this.mapToSubscription(e));
  }

  async findExpired(): Promise<Subscription[]> {
    const now = new Date();

    const entities = await this.repository.find({
      where: {
        status: 'active',
        endDate: LessThan(now),
      },
    });

    return entities.map(e => this.mapToSubscription(e));
  }

  async markAsExpired(id: string): Promise<Subscription> {
    return this.update(id, { status: 'expired' });
  }

  private mapToSubscription(entity: SubscriptionEntity): Subscription {
    return {
      id: entity.id,
      userId: entity.userId,
      tier: entity.tier as 'free' | 'premium',
      source: entity.source as 'payment' | 'trial' | 'gift' | 'lifetime',
      status: entity.status as 'active' | 'expired' | 'cancelled',
      priceStars: entity.priceStars,
      currency: 'XTR',
      startDate: entity.startDate,
      endDate: entity.endDate || null,
      trialEndsAt: entity.trialEndsAt || null,
      telegramPaymentChargeId: entity.telegramPaymentChargeId || null,
      providerPaymentChargeId: entity.providerPaymentChargeId || null,
      autoRenew: entity.autoRenew,
      grantedBy: entity.grantedBy || null,
      grantNote: entity.grantNote || null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      cancelledAt: entity.cancelledAt || null,
      cancellationReason: entity.cancellationReason || null,
    };
  }
}
