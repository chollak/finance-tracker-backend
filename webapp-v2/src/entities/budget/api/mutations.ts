import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Budget, CreateBudgetDTO, UpdateBudgetDTO } from '@/shared/types';
import { budgetKeys } from './keys';

/**
 * Hook to create a new budget
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
      // Invalidate all budget-related queries
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
      // Also invalidate dashboard
      queryClient.invalidateQueries({ queryKey: ['dashboard', variables.userId] });
    },
  });
}

/**
 * Hook to update an existing budget
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
    onSuccess: (data) => {
      // Invalidate specific budget
      queryClient.invalidateQueries({ queryKey: budgetKeys.detail(data.id) });
      // Invalidate lists and summaries
      queryClient.invalidateQueries({ queryKey: budgetKeys.lists() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
      // Invalidate dashboard
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/**
 * Hook to delete a budget
 */
export function useDeleteBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete<{ success: boolean }>(
        API_ENDPOINTS.BUDGETS.DELETE(id)
      );
      return response.data;
    },
    onSuccess: () => {
      // Invalidate all budget-related queries
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
