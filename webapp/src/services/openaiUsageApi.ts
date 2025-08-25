import { config } from '../config/env';

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
  lastUpdated: string;
}

export interface UsageAlert {
  level: 'info' | 'warning' | 'danger';
  message: string;
}

export interface CreditBalance {
  available: number;
  total: number;
  used: number;
}

export interface UsageResponse {
  success: boolean;
  data: {
    summary: UsageSummary;
    alerts: UsageAlert[];
    creditBalance?: CreditBalance;
  };
  message: string;
}

export interface DetailedUsageResponse {
  success: boolean;
  data: {
    summary: UsageSummary;
    entity: any; // Full entity data
    creditBalance?: CreditBalance;
  };
  message: string;
}

class OpenAIUsageApi {
  private readonly baseUrl = `${config.apiBase}/openai`;

  async getUsageSummary(): Promise<UsageResponse> {
    const response = await fetch(`${this.baseUrl}/usage/summary`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  }

  async getDetailedUsage(params?: {
    startDate?: string;
    endDate?: string;
    forceRefresh?: boolean;
  }): Promise<DetailedUsageResponse> {
    const searchParams = new URLSearchParams();
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    if (params?.forceRefresh) searchParams.set('forceRefresh', 'true');

    const url = `${this.baseUrl}/usage${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  }

  async refreshUsage(): Promise<DetailedUsageResponse> {
    const response = await fetch(`${this.baseUrl}/usage/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  }
}

export const openaiUsageApi = new OpenAIUsageApi();