export interface UsageData {
  object: string;
  usage: UsageDetails[];
}

export interface UsageDetails {
  aggregation_timestamp: number;
  n_requests: number;
  operation: string;
  snapshot_id: string;
  n_context_tokens_total: number;
  n_generated_tokens_total: number;
  n_cached_tokens_total?: number;
}

export interface CostData {
  object: string;
  data: CostDetails[];
  has_more: boolean;
}

export interface CostDetails {
  timestamp: number;
  line_items: LineItem[];
}

export interface LineItem {
  name: string;
  cost: number;
}

export interface BillingLimits {
  hard_limit_usd: number;
  soft_limit_usd: number;
  system_hard_limit_usd: number;
  access_until: number;
}

export interface UsageSummary {
  currentUsage: {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
  };
  limits: {
    hardLimit: number;
    softLimit: number;
    systemHardLimit: number;
    accessUntil: number;
  };
  utilization: {
    requestsPercentage: number;
    costPercentage: number;
    tokensUsed: number;
  };
  lastUpdated: Date;
}

export class OpenAIUsageEntity {
  constructor(
    public readonly id: string,
    public readonly organizationId: string,
    public readonly usageData: UsageData,
    public readonly costData: CostData,
    public readonly limits: BillingLimits,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  public getSummary(): UsageSummary {
    const totalRequests = this.usageData.usage.reduce((sum, usage) => sum + usage.n_requests, 0);
    const totalTokens = this.usageData.usage.reduce((sum, usage) => 
      sum + usage.n_context_tokens_total + usage.n_generated_tokens_total, 0);
    
    const totalCost = this.costData.data.reduce((sum, day) => 
      sum + day.line_items.reduce((daySum, item) => daySum + item.cost, 0), 0);

    const costPercentage = this.limits.hard_limit_usd > 0 
      ? (totalCost / this.limits.hard_limit_usd) * 100 
      : 0;

    return {
      currentUsage: {
        totalRequests,
        totalTokens,
        totalCost
      },
      limits: {
        hardLimit: this.limits.hard_limit_usd,
        softLimit: this.limits.soft_limit_usd,
        systemHardLimit: this.limits.system_hard_limit_usd,
        accessUntil: this.limits.access_until
      },
      utilization: {
        requestsPercentage: 0, // OpenAI doesn't provide request limits in the same format
        costPercentage,
        tokensUsed: totalTokens
      },
      lastUpdated: this.updatedAt
    };
  }

  public isApproachingLimit(threshold: number = 0.8): boolean {
    const summary = this.getSummary();
    return summary.utilization.costPercentage >= (threshold * 100);
  }

  public getRemainingBudget(): number {
    const summary = this.getSummary();
    return Math.max(0, summary.limits.hardLimit - summary.currentUsage.totalCost);
  }
}