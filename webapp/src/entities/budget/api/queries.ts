import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Budget, BudgetSummary, Alert } from '@/shared/types';
import { budgetToViewModel } from '../lib/toViewModel';
import { budgetKeys } from './keys';

/**
 * Hook to fetch all budgets for a user
 */
export function useBudgets(userId: string | null, active?: boolean) {
  return useQuery({
    queryKey: budgetKeys.list(userId || '', active),
    queryFn: async () => {
      const response = await apiClient.get<Budget[]>(
        API_ENDPOINTS.BUDGETS.LIST(userId!, active)
      );

      return response.data || [];
    },
    enabled: !!userId,
  });
}

/**
 * Hook to fetch a single budget by ID
 */
export function useBudget(id: string | null) {
  return useQuery({
    queryKey: budgetKeys.detail(id || ''),
    queryFn: async () => {
      const response = await apiClient.get<Budget>(
        API_ENDPOINTS.BUDGETS.UPDATE(id!)
      );

      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * Hook to fetch budget summaries (with spending data)
 * Returns BudgetViewModels with formatted fields
 */
export function useBudgetSummaries(userId: string | null) {
  return useQuery({
    queryKey: budgetKeys.summaries(userId || ''),
    queryFn: async () => {
      const response = await apiClient.get<BudgetSummary[]>(
        API_ENDPOINTS.BUDGETS.SUMMARIES(userId!)
      );

      const summaries = response.data || [];

      // Transform to ViewModels
      return summaries.map(budgetToViewModel);
    },
    enabled: !!userId,
  });
}

/**
 * Hook to fetch budget alerts (budgets near or over limit)
 */
export function useBudgetAlerts(userId: string | null, threshold: number = 0.8) {
  return useQuery({
    queryKey: budgetKeys.alerts(userId || '', threshold),
    queryFn: async () => {
      const response = await apiClient.get<Alert[]>(
        API_ENDPOINTS.BUDGETS.ALERTS(userId!, threshold)
      );

      return response.data || [];
    },
    enabled: !!userId,
  });
}
