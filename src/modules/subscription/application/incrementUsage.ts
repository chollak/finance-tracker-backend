/**
 * IncrementUsage Use Case
 * Increments usage counter after an action is performed
 */

import { UsageLimitRepository } from '../domain/usageLimitRepository';
import { UsageLimit, LimitType } from '../domain/usageLimit';

export interface IncrementUsageInput {
  userId: string;
  limitType: LimitType;
}

export class IncrementUsageUseCase {
  constructor(private usageLimitRepository: UsageLimitRepository) {}

  async execute(input: IncrementUsageInput): Promise<UsageLimit> {
    const { userId, limitType } = input;
    return this.usageLimitRepository.incrementCounter(userId, limitType);
  }
}

/**
 * DecrementUsage Use Case
 * Decrements usage counter (e.g., when transaction is deleted)
 */
export interface DecrementUsageInput {
  userId: string;
  limitType: LimitType;
}

export class DecrementUsageUseCase {
  constructor(private usageLimitRepository: UsageLimitRepository) {}

  async execute(input: DecrementUsageInput): Promise<UsageLimit> {
    const { userId, limitType } = input;
    return this.usageLimitRepository.decrementCounter(userId, limitType);
  }
}

/**
 * SetActiveDebtsCount Use Case
 * Sets the exact count of active debts (for sync purposes)
 */
export interface SetActiveDebtsCountInput {
  userId: string;
  count: number;
}

export class SetActiveDebtsCountUseCase {
  constructor(private usageLimitRepository: UsageLimitRepository) {}

  async execute(input: SetActiveDebtsCountInput): Promise<UsageLimit> {
    const { userId, count } = input;
    return this.usageLimitRepository.setActiveDebtsCount(userId, count);
  }
}
