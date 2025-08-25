import { Result } from '../../../shared/domain/types/Result';
import { UsageData, CostData, BillingLimits, OpenAIUsageEntity } from './usageEntity';

export interface OpenAIUsageRepository {
  /**
   * Fetch current usage data from OpenAI API
   */
  getUsageData(startDate?: Date, endDate?: Date): Promise<Result<UsageData>>;

  /**
   * Fetch cost breakdown from OpenAI API
   */
  getCostData(startDate?: Date, endDate?: Date): Promise<Result<CostData>>;

  /**
   * Fetch billing limits from OpenAI API
   */
  getBillingLimits(): Promise<Result<BillingLimits>>;

  /**
   * Cache usage data locally (optional optimization)
   */
  cacheUsageData(entity: OpenAIUsageEntity): Promise<Result<void>>;

  /**
   * Get cached usage data (optional optimization)
   */
  getCachedUsageData(maxAgeMinutes?: number): Promise<Result<OpenAIUsageEntity | null>>;

  /**
   * Get current credit balance from OpenAI API
   */
  getCreditBalance(): Promise<Result<{ available: number; total: number; used: number }>>;
}