import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Budget, BudgetSummary } from '@/shared/types';
import { budgetToViewModel } from '../lib/toViewModel';
import { budgetKeys } from './keys';
import { isGuestId } from '@/shared/lib/utils/guestId';

/**
 * Hook to fetch all budgets for a user
 * Guest users: returns empty array (no server call)
 */
export function useBudgets(userId: string | null, active?: boolean) {
  const isGuest = userId ? isGuestId(userId) : false;

  return useQuery({
    queryKey: budgetKeys.list(userId || '', active),
    queryFn: async () => {
      // Guest users don't have budgets on server
      if (isGuest) return [];

      const response = await apiClient.get<Budget[]>(
        API_ENDPOINTS.BUDGETS.LIST(userId!, active)
      );

      return response.data || [];
    },
    enabled: !!userId && !isGuest,
  });
}

/**
 * Hook to fetch a single budget by ID
 * Note: Guest users shouldn't reach this (no budgets to view)
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
 * Guest users: returns empty array (no server call)
 */
export function useBudgetSummaries(userId: string | null) {
  const isGuest = userId ? isGuestId(userId) : false;

  return useQuery({
    queryKey: budgetKeys.summaries(userId || ''),
    queryFn: async () => {
      // Guest users don't have budgets on server
      if (isGuest) return [];

      const response = await apiClient.get<BudgetSummary[]>(
        API_ENDPOINTS.BUDGETS.SUMMARIES(userId!)
      );

      const summaries = response.data || [];

      // Transform to ViewModels
      return summaries.map(budgetToViewModel);
    },
    enabled: !!userId && !isGuest,
  });
}

