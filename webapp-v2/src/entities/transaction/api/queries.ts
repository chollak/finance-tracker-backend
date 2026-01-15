import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Transaction } from '@/shared/types';
import { transactionToViewModel } from '../lib/toViewModel';
import { transactionKeys } from './keys';

/**
 * Hook to fetch all transactions for a user
 * Returns TransactionViewModels with formatted fields
 */
export function useTransactions(userId: string | null) {
  return useQuery({
    queryKey: transactionKeys.list(userId || ''),
    queryFn: async () => {
      const response = await apiClient.get<Transaction[]>(
        API_ENDPOINTS.TRANSACTIONS.LIST(userId!)
      );

      const transactions = response.data || [];

      // Transform to ViewModels
      return transactions.map(transactionToViewModel);
    },
    enabled: !!userId,
  });
}

/**
 * Hook to fetch a single transaction by ID
 */
export function useTransaction(id: string | null) {
  return useQuery({
    queryKey: transactionKeys.detail(id || ''),
    queryFn: async () => {
      const response = await apiClient.get<Transaction>(
        API_ENDPOINTS.TRANSACTIONS.UPDATE(id!)
      );

      return transactionToViewModel(response.data);
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
 */
export function useTransactionAnalytics(
  userId: string | null,
  filters?: AnalyticsFilters
) {
  return useQuery({
    queryKey: transactionKeys.analytics(userId || '', filters),
    queryFn: async () => {
      const response = await apiClient.get<TransactionAnalytics>(
        API_ENDPOINTS.TRANSACTIONS.ANALYTICS.SUMMARY(userId!, filters)
      );

      return response.data;
    },
    enabled: !!userId,
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
interface CategoryBreakdown {
  category: string;
  total: number;
  count: number;
  percentage: number;
}

/**
 * Hook to fetch category breakdown
 */
export function useCategoryBreakdown(
  userId: string | null,
  filters?: AnalyticsFilters
) {
  return useQuery({
    queryKey: transactionKeys.categorySummary(userId || '', filters),
    queryFn: async () => {
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
    enabled: !!userId,
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
 */
export function useMonthlyTrends(userId: string | null, months: number = 12) {
  return useQuery({
    queryKey: transactionKeys.trends(userId || '', months),
    queryFn: async () => {
      const response = await apiClient.get<MonthlyTrend[]>(
        API_ENDPOINTS.TRANSACTIONS.ANALYTICS.TRENDS(userId!, months)
      );

      return response.data || [];
    },
    enabled: !!userId,
  });
}
