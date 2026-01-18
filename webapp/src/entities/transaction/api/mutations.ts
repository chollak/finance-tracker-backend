import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Transaction, CreateTransactionDTO, UpdateTransactionDTO } from '@/shared/types';
import type { TransactionViewModel } from '../model/types';
import { transactionKeys } from './keys';
import { budgetKeys } from '@/entities/budget/api/keys';
import { dashboardKeys } from '@/entities/dashboard/api/keys';
import { transactionToViewModel } from '../lib/toViewModel';

/**
 * Hook to create a new transaction
 * Optimized: Uses setQueryData to update list immediately + targeted invalidation
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
    onSuccess: (newTransaction, variables) => {
      const userId = variables.userId;

      // 1. Add to transaction list immediately (NO HTTP request)
      queryClient.setQueryData<TransactionViewModel[]>(
        transactionKeys.list(userId),
        (old) => {
          const newItem = transactionToViewModel(newTransaction);
          if (!old) return [newItem];
          return [newItem, ...old];
        }
      );

      // 2. Invalidate ONLY computed data that depends on transaction totals
      queryClient.invalidateQueries({ queryKey: budgetKeys.summaries(userId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.insights(userId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.quickStats(userId) });
      // Invalidate analytics since totals changed
      queryClient.invalidateQueries({ queryKey: transactionKeys.analytics(userId) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.categorySummary(userId) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.trends(userId) });
    },
  });
}

/**
 * Hook to update an existing transaction
 * Optimized: Updates item in cache + targeted invalidation
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
    onSuccess: (updatedTransaction) => {
      const userId = updatedTransaction.userId;

      // 1. Update transaction in list cache (NO HTTP request)
      queryClient.setQueryData<TransactionViewModel[]>(
        transactionKeys.list(userId),
        (old) => {
          if (!old) return old;
          return old.map((t) =>
            t.id === updatedTransaction.id ? transactionToViewModel(updatedTransaction) : t
          );
        }
      );

      // 2. Update detail cache if it exists
      queryClient.setQueryData(
        transactionKeys.detail(updatedTransaction.id!),
        transactionToViewModel(updatedTransaction)
      );

      // 3. Invalidate computed data (amount/category might have changed)
      queryClient.invalidateQueries({ queryKey: budgetKeys.summaries(userId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.insights(userId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.quickStats(userId) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.analytics(userId) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.categorySummary(userId) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.trends(userId) });
    },
  });
}

/**
 * Hook to delete a transaction
 * Optimized: Removes from cache + targeted invalidation
 * Now accepts { id, userId } for proper cache targeting
 */
export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; userId: string }) => {
      const response = await apiClient.delete<{ success: boolean }>(
        API_ENDPOINTS.TRANSACTIONS.DELETE(id)
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      const { id, userId } = variables;

      // 1. Remove from transaction list cache (NO HTTP request)
      queryClient.setQueryData<TransactionViewModel[]>(
        transactionKeys.list(userId),
        (old) => {
          if (!old) return old;
          return old.filter((t) => t.id !== id);
        }
      );

      // 2. Remove from detail cache
      queryClient.removeQueries({ queryKey: transactionKeys.detail(id) });

      // 3. Invalidate computed data
      queryClient.invalidateQueries({ queryKey: budgetKeys.summaries(userId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.insights(userId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.quickStats(userId) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.analytics(userId) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.categorySummary(userId) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.trends(userId) });
    },
  });
}

/**
 * Hook to archive a single transaction
 * Optimized: Moves item between lists + targeted invalidation
 * Now accepts { id, userId } for proper cache targeting
 */
export function useArchiveTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; userId: string }) => {
      const response = await apiClient.post<{ message: string }>(
        API_ENDPOINTS.TRANSACTIONS.ARCHIVE.ONE(id)
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      const { id, userId } = variables;

      // 1. Get the transaction from active list before removing
      const activeList = queryClient.getQueryData<TransactionViewModel[]>(
        transactionKeys.list(userId)
      );
      const archivedTransaction = activeList?.find((t) => t.id === id);

      // 2. Remove from active list
      queryClient.setQueryData<TransactionViewModel[]>(
        transactionKeys.list(userId),
        (old) => {
          if (!old) return old;
          return old.filter((t) => t.id !== id);
        }
      );

      // 3. Add to archived list (if we found the transaction)
      if (archivedTransaction) {
        queryClient.setQueryData<TransactionViewModel[]>(
          transactionKeys.archived(userId),
          (old) => {
            const archived = { ...archivedTransaction, isArchived: true };
            if (!old) return [archived];
            return [archived, ...old];
          }
        );
      }

      // 4. Invalidate computed data
      queryClient.invalidateQueries({ queryKey: budgetKeys.summaries(userId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.insights(userId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.quickStats(userId) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.analytics(userId) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.categorySummary(userId) });
    },
  });
}

/**
 * Hook to unarchive a single transaction
 * Optimized: Moves item between lists + targeted invalidation
 * Now accepts { id, userId } for proper cache targeting
 */
export function useUnarchiveTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; userId: string }) => {
      const response = await apiClient.post<{ message: string }>(
        API_ENDPOINTS.TRANSACTIONS.ARCHIVE.UNARCHIVE(id)
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      const { id, userId } = variables;

      // 1. Get the transaction from archived list before removing
      const archivedList = queryClient.getQueryData<TransactionViewModel[]>(
        transactionKeys.archived(userId)
      );
      const unarchivedTransaction = archivedList?.find((t) => t.id === id);

      // 2. Remove from archived list
      queryClient.setQueryData<TransactionViewModel[]>(
        transactionKeys.archived(userId),
        (old) => {
          if (!old) return old;
          return old.filter((t) => t.id !== id);
        }
      );

      // 3. Add to active list (if we found the transaction)
      if (unarchivedTransaction) {
        queryClient.setQueryData<TransactionViewModel[]>(
          transactionKeys.list(userId),
          (old) => {
            const active = { ...unarchivedTransaction, isArchived: false };
            if (!old) return [active];
            // Insert at the correct position by date (newest first)
            const newList = [active, ...old];
            return newList.sort((a, b) =>
              new Date(b.date).getTime() - new Date(a.date).getTime()
            );
          }
        );
      }

      // 4. Invalidate computed data
      queryClient.invalidateQueries({ queryKey: budgetKeys.summaries(userId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.insights(userId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.quickStats(userId) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.analytics(userId) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.categorySummary(userId) });
    },
  });
}

/**
 * Hook to archive all transactions for a user
 * Optimized: Moves all items to archived list + targeted invalidation
 */
export function useArchiveAllTransactions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiClient.post<{ archivedCount: number }>(
        API_ENDPOINTS.TRANSACTIONS.ARCHIVE.ALL(userId)
      );
      return response.data;
    },
    onSuccess: (_, userId) => {
      // 1. Get all active transactions before clearing
      const activeList = queryClient.getQueryData<TransactionViewModel[]>(
        transactionKeys.list(userId)
      );

      // 2. Clear active list
      queryClient.setQueryData<TransactionViewModel[]>(
        transactionKeys.list(userId),
        []
      );

      // 3. Add all to archived list
      if (activeList && activeList.length > 0) {
        queryClient.setQueryData<TransactionViewModel[]>(
          transactionKeys.archived(userId),
          (old) => {
            const archived = activeList.map((t) => ({ ...t, isArchived: true }));
            if (!old) return archived;
            return [...archived, ...old];
          }
        );
      }

      // 4. Invalidate computed data
      queryClient.invalidateQueries({ queryKey: budgetKeys.summaries(userId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.insights(userId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.quickStats(userId) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.analytics(userId) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.categorySummary(userId) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.trends(userId) });
    },
  });
}
