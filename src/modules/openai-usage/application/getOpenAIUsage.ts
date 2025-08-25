import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { OpenAIUsageRepository } from '../domain/usageRepository';
import { OpenAIUsageEntity, UsageSummary } from '../domain/usageEntity';

export interface GetOpenAIUsageRequest {
  startDate?: Date;
  endDate?: Date;
  forceRefresh?: boolean;
}

export interface GetOpenAIUsageResponse {
  summary: UsageSummary;
  entity: OpenAIUsageEntity;
  creditBalance?: {
    available: number;
    total: number;
    used: number;
  };
}

export class GetOpenAIUsage {
  constructor(private readonly usageRepository: OpenAIUsageRepository) {}

  async execute(request: GetOpenAIUsageRequest = {}): Promise<Result<GetOpenAIUsageResponse>> {
    try {
      // Check cache first unless force refresh is requested
      if (!request.forceRefresh) {
        const cachedResult = await this.usageRepository.getCachedUsageData(5); // 5 minutes cache
        if (cachedResult.success && cachedResult.data) {
          const summary = cachedResult.data.getSummary();
          return ResultHelper.success({
            summary,
            entity: cachedResult.data
          });
        }
      }

      // Fetch fresh data from OpenAI
      const [usageResult, costResult, limitsResult, creditBalanceResult] = await Promise.all([
        this.usageRepository.getUsageData(request.startDate, request.endDate),
        this.usageRepository.getCostData(request.startDate, request.endDate),
        this.usageRepository.getBillingLimits(),
        this.usageRepository.getCreditBalance()
      ]);

      if (!usageResult.success) {
        return ResultHelper.failure(usageResult.error);
      }

      if (!costResult.success) {
        return ResultHelper.failure(costResult.error);
      }

      if (!limitsResult.success) {
        return ResultHelper.failure(limitsResult.error);
      }

      // Create entity
      const entity = new OpenAIUsageEntity(
        `usage-${Date.now()}`,
        'default-org', // You might want to get this from config
        usageResult.data,
        costResult.data,
        limitsResult.data,
        new Date(),
        new Date()
      );

      // Cache the result
      await this.usageRepository.cacheUsageData(entity);

      const summary = entity.getSummary();
      const creditBalance = creditBalanceResult.success ? creditBalanceResult.data : undefined;

      return ResultHelper.success({
        summary,
        entity,
        creditBalance
      });
    } catch (error) {
      return ResultHelper.failure(new Error(`Failed to get OpenAI usage: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
}