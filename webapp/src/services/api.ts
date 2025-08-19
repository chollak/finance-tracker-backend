import {
  Budget,
  BudgetSummary,
  BudgetPeriod,
  AnalyticsSummary,
  CategoryBreakdown,
  MonthlyTrend,
  SpendingPattern,
  DashboardInsights,
  Alert,
  FinancialHealthScore,
  ApiResponse
} from '../types';
import { config } from '../config/env';

const API_BASE = config.apiBase;

// Enhanced fetch with logging for development
async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const fullUrl = `${API_BASE}${url}`;
  
  config.log.debug(`API Request: ${options?.method || 'GET'} ${fullUrl}`);
  
  try {
    const response = await fetch(fullUrl, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    const data = await response.json();
    
    if (!response.ok) {
      config.log.error(`API Error: ${response.status}`, data);
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    
    config.log.debug(`API Response: ${response.status}`, data);
    return data;
  } catch (error) {
    config.log.error(`API Request failed: ${fullUrl}`, error);
    throw error;
  }
}

// Budget Management API
export const budgetApi = {
  // Create a new budget
  async createBudget(userId: string, budgetData: {
    name: string;
    amount: number;
    period: BudgetPeriod;
    startDate: string;
    endDate: string;
    categoryIds?: string[];
    description?: string;
  }): Promise<ApiResponse<Budget>> {
    return apiRequest(`/budgets/users/${userId}/budgets`, {
      method: 'POST',
      body: JSON.stringify(budgetData)
    });
  },

  // Get user's budgets
  async getBudgets(userId: string, activeOnly?: boolean): Promise<ApiResponse<Budget[]>> {
    const url = `/budgets/users/${userId}/budgets${activeOnly ? '?active=true' : ''}`;
    return apiRequest(url);
  },

  // Get budget by ID
  async getBudget(budgetId: string): Promise<ApiResponse<Budget>> {
    const response = await fetch(`${API_BASE}/budgets/budgets/${budgetId}`);
    return response.json();
  },

  // Update budget
  async updateBudget(budgetId: string, updates: Partial<Budget>): Promise<ApiResponse<Budget>> {
    const response = await fetch(`${API_BASE}/budgets/budgets/${budgetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    return response.json();
  },

  // Delete budget
  async deleteBudget(budgetId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`${API_BASE}/budgets/budgets/${budgetId}`, {
      method: 'DELETE'
    });
    return response.json();
  },

  // Get budget summaries
  async getBudgetSummaries(userId: string): Promise<ApiResponse<BudgetSummary[]>> {
    const response = await fetch(`${API_BASE}/budgets/users/${userId}/budgets/summaries`);
    return response.json();
  },

  // Get budget alerts
  async getBudgetAlerts(userId: string, threshold?: number): Promise<ApiResponse<{
    nearLimit: BudgetSummary[];
    overBudget: BudgetSummary[];
    totalAlerts: number;
  }>> {
    const url = `${API_BASE}/budgets/users/${userId}/budgets/alerts${threshold ? `?threshold=${threshold}` : ''}`;
    const response = await fetch(url);
    return response.json();
  },

  // Recalculate budget spending
  async recalculateBudget(budgetId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`${API_BASE}/budgets/budgets/${budgetId}/recalculate`, {
      method: 'POST'
    });
    return response.json();
  }
};

// Enhanced Analytics API
export const analyticsApi = {
  // Get detailed analytics summary
  async getAnalyticsSummary(
    userId: string, 
    startDate?: string, 
    endDate?: string
  ): Promise<ApiResponse<AnalyticsSummary>> {
    let url = `${API_BASE}/transactions/analytics/summary/${userId}`;
    if (startDate && endDate) {
      url += `?startDate=${startDate}&endDate=${endDate}`;
    }
    const response = await fetch(url);
    return response.json();
  },

  // Get detailed category breakdown
  async getCategoryBreakdown(
    userId: string, 
    startDate?: string, 
    endDate?: string
  ): Promise<ApiResponse<CategoryBreakdown>> {
    let url = `${API_BASE}/transactions/analytics/categories/${userId}`;
    if (startDate && endDate) {
      url += `?startDate=${startDate}&endDate=${endDate}`;
    }
    const response = await fetch(url);
    return response.json();
  },

  // Get monthly trends
  async getMonthlyTrends(userId: string, months?: number): Promise<ApiResponse<MonthlyTrend[]>> {
    let url = `${API_BASE}/transactions/analytics/trends/${userId}`;
    if (months) {
      url += `?months=${months}`;
    }
    const response = await fetch(url);
    return response.json();
  },

  // Get spending patterns
  async getSpendingPatterns(
    userId: string, 
    startDate?: string, 
    endDate?: string
  ): Promise<ApiResponse<SpendingPattern[]>> {
    let url = `${API_BASE}/transactions/analytics/patterns/${userId}`;
    if (startDate && endDate) {
      url += `?startDate=${startDate}&endDate=${endDate}`;
    }
    const response = await fetch(url);
    return response.json();
  },

  // Get top categories
  async getTopCategories(
    userId: string, 
    limit?: number,
    startDate?: string, 
    endDate?: string
  ): Promise<ApiResponse<Array<{ category: string; amount: number; percentage: number }>>> {
    let url = `${API_BASE}/transactions/analytics/top-categories/${userId}`;
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    const response = await fetch(url);
    return response.json();
  }
};

// Dashboard API
export const dashboardApi = {
  // Get complete dashboard data
  async getCompleteDashboard(
    userId: string, 
    startDate?: string, 
    endDate?: string
  ): Promise<ApiResponse<{
    insights: DashboardInsights;
    alerts: { active: Alert[]; summary: any };
    healthScore: FinancialHealthScore;
    weeklyInsights: any[];
    lastUpdated: string;
  }>> {
    let url = `${API_BASE}/dashboard/${userId}`;
    if (startDate && endDate) {
      url += `?startDate=${startDate}&endDate=${endDate}`;
    }
    const response = await fetch(url);
    return response.json();
  },

  // Get dashboard insights
  async getDashboardInsights(
    userId: string, 
    startDate?: string, 
    endDate?: string
  ): Promise<ApiResponse<DashboardInsights>> {
    let url = `${API_BASE}/dashboard/insights/${userId}`;
    if (startDate && endDate) {
      url += `?startDate=${startDate}&endDate=${endDate}`;
    }
    const response = await fetch(url);
    return response.json();
  },

  // Get financial health score
  async getFinancialHealthScore(userId: string): Promise<ApiResponse<FinancialHealthScore>> {
    const response = await fetch(`${API_BASE}/dashboard/insights/${userId}/health-score`);
    return response.json();
  },

  // Get weekly insights
  async getWeeklyInsights(userId: string, weeks?: number): Promise<ApiResponse<any[]>> {
    let url = `${API_BASE}/dashboard/insights/${userId}/weekly`;
    if (weeks) {
      url += `?weeks=${weeks}`;
    }
    const response = await fetch(url);
    return response.json();
  },

  // Get alerts
  async getAlerts(userId: string, type?: string, severity?: string): Promise<ApiResponse<Alert[]>> {
    let url = `${API_BASE}/dashboard/alerts/${userId}`;
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (severity) params.append('severity', severity);
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    const response = await fetch(url);
    return response.json();
  },

  // Get alert summary
  async getAlertSummary(userId: string): Promise<ApiResponse<{
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    actionable: number;
  }>> {
    const response = await fetch(`${API_BASE}/dashboard/alerts/${userId}/summary`);
    return response.json();
  },

  // Get quick stats
  async getQuickStats(userId: string): Promise<ApiResponse<{
    netIncome: number;
    totalExpenses: number;
    activeBudgets: number;
    overBudgetCount: number;
    savingsRate: number;
    criticalAlerts: number;
    totalAlerts: number;
    topSpendingCategory: string;
    spendingTrend: string;
  }>> {
    const response = await fetch(`${API_BASE}/dashboard/${userId}/quick-stats`);
    return response.json();
  }
};

// Utility functions
export const apiUtils = {
  // Format date for API calls
  formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  },

  // Get current month date range
  getCurrentMonthRange(): { startDate: string; endDate: string } {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    return {
      startDate: this.formatDate(startDate),
      endDate: this.formatDate(endDate)
    };
  },

  // Get last N months range
  getLastNMonthsRange(months: number): { startDate: string; endDate: string } {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
    
    return {
      startDate: this.formatDate(startDate),
      endDate: this.formatDate(now)
    };
  }
};