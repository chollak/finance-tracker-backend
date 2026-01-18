import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Budget, BudgetSummary, CreateBudgetDTO, UpdateBudgetDTO } from '@/shared/types';
import { budgetKeys } from './keys';
import { alertKeys } from '@/entities/alert/api/keys';
import { dashboardKeys } from '@/entities/dashboard/api/keys';

/**
 * Hook to create a new budget
 * Optimized: Invalidates only summaries + targeted dashboard invalidation
 */
export function useCreateBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateBudgetDTO) => {
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
      // Invalidate alerts (new budget might trigger alerts)
      queryClient.invalidateQueries({ queryKey: alertKeys.budgetAlerts(userId) });
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
      // Invalidate alerts
      queryClient.invalidateQueries({ queryKey: alertKeys.budgetAlerts(userId) });
      // Invalidate dashboard
      queryClient.invalidateQueries({ queryKey: dashboardKeys.insights(userId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.quickStats(userId) });
    },
  });
}

/**
 * Hook to delete a budget
 * Optimized: Removes from cache + targeted invalidation
 * Now accepts { id, userId } for proper cache targeting
 */
export function useDeleteBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; userId: string }) => {
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
      // Invalidate alerts
      queryClient.invalidateQueries({ queryKey: alertKeys.budgetAlerts(userId) });
      // Invalidate dashboard
      queryClient.invalidateQueries({ queryKey: dashboardKeys.insights(userId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.quickStats(userId) });
    },
  });
}
