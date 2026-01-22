import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Transaction, CreateTransactionDTO, UpdateTransactionDTO } from '@/shared/types';
import type { TransactionViewModel } from '../model/types';
import { transactionKeys } from './keys';
import { budgetKeys } from '@/entities/budget/api/keys';
import { dashboardKeys } from '@/entities/dashboard/api/keys';
import { subscriptionKeys } from '@/entities/subscription/api/keys';
import { transactionToViewModel } from '../lib/toViewModel';
import { transactionDataSource } from '@/shared/lib/db';
import type { LocalTransaction } from '@/shared/lib/db/schema';

/**
 * Convert LocalTransaction to Transaction format for React Query cache
 */
function localToTransaction(local: LocalTransaction): Transaction {
  return {
    id: local.serverId || local.id, // Use serverId if synced, otherwise local id
    date: local.date,
    category: local.category,
    description: local.description,
    amount: local.amount,
    type: local.type,
    userId: local.userId,
    merchant: local.merchant,
    createdAt: new Date(local.localCreatedAt).toISOString(),
    isArchived: local.isArchived,
  };
}

/**
 * Hook to create a new transaction
 * Offline-first: saves to IndexedDB, syncs to server for authenticated users
 */
export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateTransactionDTO) => {
      // Use dataSource - handles guest (local only) vs telegram (hybrid) modes
      const localTx = await transactionDataSource.create({
        date: data.date,
        category: data.category,
        description: data.description,
        amount: data.amount,
        type: data.type,
        userId: data.userId,
        merchant: data.merchant,
      });
      return localToTransaction(localTx);
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
      // Invalidate subscription to refresh usage limits (transaction count increased)
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.status(userId) });
    },
  });
}

/**
 * Hook to update an existing transaction
 * Offline-first: updates IndexedDB, syncs to server for authenticated users
 */
export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; userId: string; data: UpdateTransactionDTO }) => {
      // Use dataSource - handles guest (local only) vs telegram (hybrid) modes
      const localTx = await transactionDataSource.update(id, {
        date: data.date,
        category: data.category,
        description: data.description,
        amount: data.amount,
        type: data.type,
        merchant: data.merchant,
      });
      if (!localTx) {
        throw new Error('Transaction not found');
      }
      return localToTransaction(localTx);
    },
    onSuccess: (updatedTransaction, variables) => {
      // Use userId from variables for reliable cache key targeting
      const userId = variables.userId;

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
 * Offline-first: deletes from IndexedDB, syncs to server for authenticated users
 */
export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; userId: string }) => {
      // Use dataSource - handles guest (local only) vs telegram (hybrid) modes
      const success = await transactionDataSource.delete(id);
      return { success };
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
      // Invalidate subscription to refresh usage limits (transaction count decreased)
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.status(userId) });
    },
  });
}

/**
 * Hook to archive a single transaction
 * Note: Archive operations still use API as they're not critical for offline-first
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
 * Note: Archive operations still use API as they're not critical for offline-first
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
 * Note: Archive operations still use API as they're not critical for offline-first
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
