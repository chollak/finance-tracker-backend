import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Transaction, CreateTransactionDTO, UpdateTransactionDTO } from '@/shared/types';
import { transactionKeys } from './keys';

/**
 * Hook to create a new transaction
 */
export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateTransactionDTO) => {
      const response = await apiClient.post<Transaction>(
        API_ENDPOINTS.TRANSACTIONS.CREATE,
        data
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      // Invalidate all transaction-related queries
      queryClient.invalidateQueries({ queryKey: transactionKeys.all });
      // Also invalidate dashboard and budget queries
      queryClient.invalidateQueries({ queryKey: ['dashboard', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

/**
 * Hook to update an existing transaction
 */
export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTransactionDTO }) => {
      const response = await apiClient.put<Transaction>(
        API_ENDPOINTS.TRANSACTIONS.UPDATE(id),
        data
      );
      return response.data;
    },
    onSuccess: (data) => {
      // Invalidate specific transaction
      queryClient.invalidateQueries({ queryKey: transactionKeys.detail(data.id!) });
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: transactionKeys.lists() });
      // Invalidate analytics
      queryClient.invalidateQueries({ queryKey: transactionKeys.all });
      // Invalidate dashboard and budgets
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

/**
 * Hook to delete a transaction
 */
export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete<{ success: boolean }>(
        API_ENDPOINTS.TRANSACTIONS.DELETE(id)
      );
      return response.data;
    },
    onSuccess: () => {
      // Invalidate all transaction-related queries
      queryClient.invalidateQueries({ queryKey: transactionKeys.all });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}
