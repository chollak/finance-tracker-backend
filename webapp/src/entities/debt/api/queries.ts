import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Debt, DebtWithPayments, DebtSummary } from '@/shared/types';
import { debtToViewModel } from '../lib/toViewModel';
import { debtKeys } from './keys';

interface DebtFilters {
  status?: string;
  type?: string;
}

/**
 * Hook to fetch all debts for a user
 */
export function useDebts(userId: string | null, filters?: DebtFilters) {
  return useQuery({
    queryKey: debtKeys.list(userId || '', filters),
    queryFn: async () => {
      const response = await apiClient.get<Debt[]>(
        API_ENDPOINTS.DEBTS.LIST(userId!, filters?.status, filters?.type)
      );

      const debts = response.data || [];
      return debts.map(debtToViewModel);
    },
    enabled: !!userId,
  });
}

/**
 * Hook to fetch a single debt by ID
 */
export function useDebt(debtId: string | null) {
  return useQuery({
    queryKey: debtKeys.detail(debtId || ''),
    queryFn: async () => {
      const response = await apiClient.get<Debt>(
        API_ENDPOINTS.DEBTS.DETAIL(debtId!)
      );

      return debtToViewModel(response.data);
    },
    enabled: !!debtId,
  });
}

/**
 * Hook to fetch a debt with its payment history
 */
export function useDebtWithPayments(debtId: string | null) {
  return useQuery({
    queryKey: debtKeys.withPayments(debtId || ''),
    queryFn: async () => {
      const response = await apiClient.get<DebtWithPayments>(
        API_ENDPOINTS.DEBTS.WITH_PAYMENTS(debtId!)
      );

      return {
        ...debtToViewModel(response.data),
        payments: response.data.payments || [],
      };
    },
    enabled: !!debtId,
  });
}

/**
 * Hook to fetch debt summary for a user
 */
export function useDebtSummary(userId: string | null) {
  return useQuery({
    queryKey: debtKeys.summary(userId || ''),
    queryFn: async () => {
      const response = await apiClient.get<DebtSummary>(
        API_ENDPOINTS.DEBTS.SUMMARY(userId!)
      );

      return response.data;
    },
    enabled: !!userId,
  });
}
