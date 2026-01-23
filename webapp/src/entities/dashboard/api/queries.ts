import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import type { DashboardData } from '@/shared/types';
import { dashboardKeys } from './keys';
import { useUserStore } from '@/entities/user/model/store';
import { transactionDataSource } from '@/shared/lib/db';

/**
 * Build minimal DashboardData from local analytics for guest mode
 */
function buildLocalDashboardData(analytics: {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  transactionCount: number;
}): DashboardData {
  return {
    insights: {
      financialSummary: {
        totalIncome: analytics.totalIncome,
        totalExpense: analytics.totalExpense,
        netIncome: analytics.balance,
        transactionCount: analytics.transactionCount,
        averageTransactionAmount: analytics.transactionCount > 0
          ? (analytics.totalIncome + analytics.totalExpense) / analytics.transactionCount
          : 0,
        period: 'month',
      },
      budgetOverview: {
        totalBudgets: 0,
        activeBudgets: 0,
        totalBudgetAmount: 0,
        totalSpent: analytics.totalExpense,
        budgetsNearLimit: 0,
        overBudgetCount: 0,
      },
      topCategories: [],
      monthlyTrends: [],
      spendingPatterns: [],
      budgetAlerts: {
        nearLimit: [],
        overBudget: [],
        recommendations: [],
      },
      insights: {
        topSpendingDay: '',
        averageMonthlySpending: analytics.totalExpense,
        spendingTrend: 'stable',
        budgetUtilization: 0,
        savingsRate: analytics.totalIncome > 0
          ? ((analytics.totalIncome - analytics.totalExpense) / analytics.totalIncome) * 100
          : 0,
      },
    },
    alerts: {
      active: [],
      summary: {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        actionable: 0,
      },
    },
    healthScore: {
      score: 0,
      factors: {
        budgetCompliance: 0,
        savingsRate: 0,
        expenseVariability: 0,
        categoryDiversification: 0,
      },
      recommendations: [],
    },
    weeklyInsights: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Fetch dashboard data for a user
 * Offline-first: uses local data for guest, API for authenticated users
 */
export function useDashboardInsights(userId: string | null) {
  const userType = useUserStore((state) => state.userType);

  return useQuery({
    queryKey: dashboardKeys.insights(userId || ''),
    queryFn: async () => {
      // Guest mode: compute from local IndexedDB
      if (userType === 'guest') {
        const analytics = await transactionDataSource.getAnalytics() as {
          totalIncome?: number;
          totalExpense?: number;
          balance?: number;
          transactionCount?: number;
        } | null;

        if (!analytics) {
          return buildLocalDashboardData({
            totalIncome: 0,
            totalExpense: 0,
            balance: 0,
            transactionCount: 0,
          });
        }
        return buildLocalDashboardData({
          totalIncome: analytics.totalIncome ?? 0,
          totalExpense: analytics.totalExpense ?? 0,
          balance: analytics.balance ?? 0,
          transactionCount: analytics.transactionCount ?? 0,
        });
      }

      // Telegram mode: use API
      const response = await apiClient.get<DashboardData>(`/dashboard/${userId}`);
      return response.data;
    },
    enabled: !!userId,
  });
}

/**
 * Fetch quick stats for dashboard
 * Guest users: returns empty stats (no server call)
 */
export function useQuickStats(userId: string | null) {
  const userType = useUserStore((state) => state.userType);
  const isGuest = userType === 'guest';

  return useQuery({
    queryKey: dashboardKeys.quickStats(userId || ''),
    queryFn: async () => {
      // Guest mode: return empty stats (no budgets/alerts for guests)
      if (isGuest) {
        return {
          activeBudgets: 0,
          alertsCount: 0,
          savingsRate: 0,
        };
      }

      const response = await apiClient.get<{
        activeBudgets: number;
        alertsCount: number;
        savingsRate: number;
      }>(`/dashboard/${userId}/quick-stats`);
      return response.data;
    },
    enabled: !!userId && !isGuest,
  });
}
