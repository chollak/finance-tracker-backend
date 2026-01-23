import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Budget, BudgetSummary, CreateBudgetDTO, UpdateBudgetDTO } from '@/shared/types';
import { budgetKeys } from './keys';
import { dashboardKeys } from '@/entities/dashboard/api/keys';
import { isGuestId } from '@/shared/lib/utils/guestId';

/**
 * Error thrown when guest user tries to access server features
 */
export class GuestAccessError extends Error {
  constructor(feature: string) {
    super(`Для ${feature} необходимо войти через Telegram`);
    this.name = 'GuestAccessError';
  }
}

/**
 * Hook to create a new budget
 * Guest users: throws GuestAccessError
 */
export function useCreateBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateBudgetDTO) => {
      // Block guest users from creating budgets
      if (isGuestId(data.userId)) {
        throw new GuestAccessError('создания бюджетов');
      }

      const response = await apiClient.post<Budget>(
        API_ENDPOINTS.BUDGETS.CREATE(data.userId),
        data
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      const userId = variables.userId;

      // Invalidate budget summaries (need recalculation from server)
      queryClient.invalidateQueries({ queryKey: budgetKeys.summaries(userId) });
      queryClient.invalidateQueries({ queryKey: budgetKeys.list(userId) });
      // Invalidate dashboard budget overview
      queryClient.invalidateQueries({ queryKey: dashboardKeys.insights(userId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.quickStats(userId) });
    },
  });
}

/**
 * Hook to update an existing budget
 * Optimized: Updates cache directly + targeted invalidation
 */
export function useUpdateBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateBudgetDTO }) => {
      const response = await apiClient.put<Budget>(
        API_ENDPOINTS.BUDGETS.UPDATE(id),
        data
      );
      return response.data;
    },
    onSuccess: (updatedBudget) => {
      const userId = updatedBudget.userId;

      // Update detail cache
      queryClient.setQueryData(
        budgetKeys.detail(updatedBudget.id),
        updatedBudget
      );

      // Invalidate summaries (spent calculation might change due to category/date changes)
      queryClient.invalidateQueries({ queryKey: budgetKeys.summaries(userId) });
      queryClient.invalidateQueries({ queryKey: budgetKeys.list(userId) });
      // Invalidate dashboard
      queryClient.invalidateQueries({ queryKey: dashboardKeys.insights(userId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.quickStats(userId) });
    },
  });
}

/**
 * Hook to delete a budget
 * Guest users: throws GuestAccessError
 */
export function useDeleteBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      // Block guest users
      if (isGuestId(userId)) {
        throw new GuestAccessError('удаления бюджетов');
      }

      const response = await apiClient.delete<{ success: boolean }>(
        API_ENDPOINTS.BUDGETS.DELETE(id)
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      const { id, userId } = variables;

      // Remove from summaries cache
      queryClient.setQueryData<BudgetSummary[]>(
        budgetKeys.summaries(userId),
        (old) => {
          if (!old) return old;
          return old.filter((b) => b.id !== id);
        }
      );

      // Remove detail cache
      queryClient.removeQueries({ queryKey: budgetKeys.detail(id) });

      // Invalidate list (might need refresh)
      queryClient.invalidateQueries({ queryKey: budgetKeys.list(userId) });
      // Invalidate dashboard
      queryClient.invalidateQueries({ queryKey: dashboardKeys.insights(userId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.quickStats(userId) });
    },
  });
}
