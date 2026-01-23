import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Transaction } from '@/shared/types';
import { transactionToViewModel } from '../lib/toViewModel';
import { transactionKeys } from './keys';
import { transactionDataSource } from '@/shared/lib/db';
import type { LocalTransaction } from '@/shared/lib/db/schema';
import { isGuestId } from '@/shared/lib/utils/guestId';

/**
 * Convert LocalTransaction to Transaction format
 */
function localToTransaction(local: LocalTransaction): Transaction {
  return {
    id: local.id,
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
 * Hook to fetch all transactions for a user
 * Offline-first: reads from IndexedDB for guest, hybrid mode for authenticated
 */
export function useTransactions(userId: string | null) {
  return useQuery({
    queryKey: transactionKeys.list(userId || ''),
    queryFn: async () => {
      // Use dataSource - handles guest (local only) vs telegram (hybrid) modes
      const localTransactions = await transactionDataSource.getAll();

      // Convert to Transaction format, then to ViewModels
      const transactions = localTransactions.map(localToTransaction);
      return transactions.map(transactionToViewModel);
    },
    enabled: !!userId,
  });
}

/**
 * Hook to fetch a single transaction by ID
 * Guest: IndexedDB, Telegram: Server API
 */
export function useTransaction(id: string | null) {
  return useQuery({
    queryKey: transactionKeys.detail(id || ''),
    queryFn: async () => {
      // Use dataSource - handles guest (IndexedDB) vs telegram (server API)
      const localTx = await transactionDataSource.getById(id!);

      if (!localTx) {
        throw new Error('Transaction not found');
      }

      return transactionToViewModel(localToTransaction(localTx));
    },
    enabled: !!id,
  });
}

interface AnalyticsFilters extends Record<string, unknown> {
  startDate?: string;
  endDate?: string;
}

interface TransactionAnalytics {
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  savingsRate: number;
  transactionCount: number;
  averageTransaction: number;
  largestExpense?: {
    amount: number;
    category: string;
    description: string;
  };
  largestIncome?: {
    amount: number;
    category: string;
    description: string;
  };
}

/**
 * Hook to fetch transaction analytics
 * Guest users: returns empty analytics (no server call)
 */
export function useTransactionAnalytics(
  userId: string | null,
  filters?: AnalyticsFilters
) {
  const isGuest = userId ? isGuestId(userId) : false;

  return useQuery({
    queryKey: transactionKeys.analytics(userId || '', filters),
    queryFn: async () => {
      // Guest users: return empty analytics
      if (isGuest) {
        return {
          totalIncome: 0,
          totalExpenses: 0,
          netSavings: 0,
          savingsRate: 0,
          transactionCount: 0,
          averageTransaction: 0,
        } as TransactionAnalytics;
      }

      const response = await apiClient.get<TransactionAnalytics>(
        API_ENDPOINTS.TRANSACTIONS.ANALYTICS.SUMMARY(userId!, filters)
      );

      return response.data;
    },
    enabled: !!userId && !isGuest,
  });
}

/**
 * Backend response format for category breakdown
 */
interface BackendCategoryBreakdown {
  [category: string]: {
    amount: number;
    count: number;
    percentage: number;
  };
}

/**
 * Frontend format for category breakdown
 */
export interface CategoryBreakdown {
  category: string;
  total: number;
  count: number;
  percentage: number;
}

/**
 * Hook to fetch category breakdown
 * Guest users: returns empty array (no server call)
 */
export function useCategoryBreakdown(
  userId: string | null,
  filters?: AnalyticsFilters
) {
  const isGuest = userId ? isGuestId(userId) : false;

  return useQuery({
    queryKey: transactionKeys.categorySummary(userId || '', filters),
    queryFn: async (): Promise<CategoryBreakdown[]> => {
      // Guest users: return empty breakdown
      if (isGuest) return [];

      const response = await apiClient.get<BackendCategoryBreakdown>(
        API_ENDPOINTS.TRANSACTIONS.ANALYTICS.CATEGORIES(userId!, filters)
      );

      // Transform object to array format expected by frontend
      const data = response.data || {};
      return Object.entries(data).map(([category, info]) => ({
        category,
        total: info.amount,
        count: info.count,
        percentage: info.percentage,
      }));
    },
    enabled: !!userId && !isGuest,
  });
}

interface MonthlyTrend {
  month: string;
  income: number;
  expenses: number;
  netSavings: number;
}

/**
 * Hook to fetch monthly trends
 * Guest users: returns empty array (no server call)
 */
export function useMonthlyTrends(userId: string | null, months: number = 12) {
  const isGuest = userId ? isGuestId(userId) : false;

  return useQuery({
    queryKey: transactionKeys.trends(userId || '', months),
    queryFn: async () => {
      // Guest users: return empty trends
      if (isGuest) return [];

      const response = await apiClient.get<MonthlyTrend[]>(
        API_ENDPOINTS.TRANSACTIONS.ANALYTICS.TRENDS(userId!, months)
      );

      return response.data || [];
    },
    enabled: !!userId && !isGuest,
  });
}

/**
 * Hook to fetch archived transactions for a user
 * Guest users: returns empty array (no server call)
 */
export function useArchivedTransactions(userId: string | null) {
  const isGuest = userId ? isGuestId(userId) : false;

  return useQuery({
    queryKey: transactionKeys.archived(userId || ''),
    queryFn: async () => {
      // Guest users: return empty archived list
      if (isGuest) return [];

      const response = await apiClient.get<Transaction[]>(
        API_ENDPOINTS.TRANSACTIONS.ARCHIVE.LIST(userId!)
      );

      const transactions = response.data || [];
      return transactions.map(transactionToViewModel);
    },
    enabled: !!userId && !isGuest,
  });
}
