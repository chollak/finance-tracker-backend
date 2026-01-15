import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import type { Alert } from '@/shared/types';
import { alertToViewModel } from '../lib/toViewModel';
import { alertKeys } from './keys';

/**
 * Hook to fetch budget alerts for a user
 * @param userId - User ID
 * @param threshold - Budget threshold (0-1), defaults to 0.8 (80%)
 */
export function useBudgetAlerts(userId: string | null, threshold: number = 0.8) {
  return useQuery({
    queryKey: alertKeys.budgetAlerts(userId || '', threshold),
    queryFn: async () => {
      const response = await apiClient.get<Alert[]>(
        `/budgets/users/${userId}/budgets/alerts?threshold=${threshold}`
      );

      const alerts = response.data || [];

      // Transform to ViewModels
      return alerts.map(alertToViewModel);
    },
    enabled: !!userId,
  });
}
