import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import type { DashboardInsights } from '@/shared/types';
import { dashboardKeys } from './keys';

/**
 * Fetch dashboard insights for a user
 */
export function useDashboardInsights(userId: string | null) {
  return useQuery({
    queryKey: dashboardKeys.insights(userId || ''),
    queryFn: async () => {
      const response = await apiClient.get<DashboardInsights>(`/dashboard/${userId}`);
      return response.data;
    },
    enabled: !!userId,
  });
}

/**
 * Fetch quick stats for dashboard
 */
export function useQuickStats(userId: string | null) {
  return useQuery({
    queryKey: dashboardKeys.quickStats(userId || ''),
    queryFn: async () => {
      const response = await apiClient.get<{
        activeBudgets: number;
        alertsCount: number;
        savingsRate: number;
      }>(`/dashboard/${userId}/quick-stats`);
      return response.data;
    },
    enabled: !!userId,
  });
}
