/**
 * SQLite UsageLimit Repository Implementation
 */

import { Repository } from 'typeorm';
import { AppDataSource } from '../../../shared/infrastructure/database/database.config';
import { UsageLimit as UsageLimitEntity } from '../../../shared/infrastructure/database/entities/UsageLimit';
import { UsageLimitRepository } from '../domain/usageLimitRepository';
import {
  UsageLimit,
  CreateUsageLimitDTO,
  LimitType,
  getCurrentMonthPeriod,
  isPeriodExpired,
} from '../domain/usageLimit';

export class SqliteUsageLimitRepository implements UsageLimitRepository {
  private repository: Repository<UsageLimitEntity>;

  constructor() {
    this.repository = AppDataSource.getRepository(UsageLimitEntity);
  }

  async findByUserId(userId: string): Promise<UsageLimit | null> {
    const entity = await this.repository.findOne({ where: { userId } });
    return entity ? this.mapToUsageLimit(entity) : null;
  }

  async findOrCreateForCurrentPeriod(userId: string): Promise<UsageLimit> {
    const existing = await this.findByUserId(userId);

    if (existing) {
      // Check if period has expired
      if (isPeriodExpired(existing.periodEnd)) {
        // Reset counters for new period
        return this.resetMonthlyCounters(userId);
      }
      return existing;
    }

    // Create new usage limit
    return this.create({ userId });
  }

  async create(dto: CreateUsageLimitDTO): Promise<UsageLimit> {
    const period = getCurrentMonthPeriod();

    const entity = this.repository.create({
      userId: dto.userId,
      periodStart: dto.periodStart || period.start,
      periodEnd: dto.periodEnd || period.end,
      transactionsCount: 0,
      voiceInputsCount: 0,
      activeDebtsCount: 0,
    });

    const saved = await this.repository.save(entity);
    return this.mapToUsageLimit(saved);
  }

  async incrementCounter(userId: string, limitType: LimitType): Promise<UsageLimit> {
    const usageLimit = await this.findOrCreateForCurrentPeriod(userId);

    const updateData: Partial<UsageLimitEntity> = {};

    switch (limitType) {
      case 'transactions':
        updateData.transactionsCount = usageLimit.transactionsCount + 1;
        break;
      case 'voice_inputs':
        updateData.voiceInputsCount = usageLimit.voiceInputsCount + 1;
        break;
      case 'debts':
        updateData.activeDebtsCount = usageLimit.activeDebtsCount + 1;
        break;
    }

    await this.repository.update({ userId }, updateData);

    const updated = await this.findByUserId(userId);
    if (!updated) {
      throw new Error('UsageLimit not found after increment');
    }
    return updated;
  }

  async decrementCounter(userId: string, limitType: LimitType): Promise<UsageLimit> {
    const usageLimit = await this.findOrCreateForCurrentPeriod(userId);

    const updateData: Partial<UsageLimitEntity> = {};

    switch (limitType) {
      case 'transactions':
        updateData.transactionsCount = Math.max(0, usageLimit.transactionsCount - 1);
        break;
      case 'voice_inputs':
        updateData.voiceInputsCount = Math.max(0, usageLimit.voiceInputsCount - 1);
        break;
      case 'debts':
        updateData.activeDebtsCount = Math.max(0, usageLimit.activeDebtsCount - 1);
        break;
    }

    await this.repository.update({ userId }, updateData);

    const updated = await this.findByUserId(userId);
    if (!updated) {
      throw new Error('UsageLimit not found after decrement');
    }
    return updated;
  }

  async setActiveDebtsCount(userId: string, count: number): Promise<UsageLimit> {
    await this.findOrCreateForCurrentPeriod(userId);

    await this.repository.update({ userId }, {
      activeDebtsCount: Math.max(0, count),
    });

    const updated = await this.findByUserId(userId);
    if (!updated) {
      throw new Error('UsageLimit not found after setting debts count');
    }
    return updated;
  }

  async resetMonthlyCounters(userId: string): Promise<UsageLimit> {
    const existing = await this.findByUserId(userId);
    const period = getCurrentMonthPeriod();

    if (existing) {
      await this.repository.update({ userId }, {
        periodStart: period.start,
        periodEnd: period.end,
        transactionsCount: 0,
        voiceInputsCount: 0,
        // Note: activeDebtsCount is NOT reset (it's current state, not monthly)
      });

      const updated = await this.findByUserId(userId);
      if (!updated) {
        throw new Error('UsageLimit not found after reset');
      }
      return updated;
    }

    return this.create({ userId });
  }

  private mapToUsageLimit(entity: UsageLimitEntity): UsageLimit {
    return {
      id: entity.id,
      userId: entity.userId,
      periodStart: entity.periodStart,
      periodEnd: entity.periodEnd,
      transactionsCount: entity.transactionsCount,
      voiceInputsCount: entity.voiceInputsCount,
      activeDebtsCount: entity.activeDebtsCount,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
