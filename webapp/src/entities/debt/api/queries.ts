import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Debt, DebtWithPayments, DebtSummary } from '@/shared/types';
import { debtToViewModel } from '../lib/toViewModel';
import { debtKeys } from './keys';
import { isGuestId } from '@/shared/lib/utils/guestId';

interface DebtFilters {
  status?: string;
  type?: string;
}

/**
 * Hook to fetch all debts for a user
 * Guest users: returns empty array (no server call)
 */
export function useDebts(userId: string | null, filters?: DebtFilters) {
  const isGuest = userId ? isGuestId(userId) : false;

  return useQuery({
    queryKey: debtKeys.list(userId || '', filters),
    queryFn: async () => {
      // Guest users don't have debts on server
      if (isGuest) return [];

      const response = await apiClient.get<Debt[]>(
        API_ENDPOINTS.DEBTS.LIST(userId!, filters?.status, filters?.type)
      );

      const debts = response.data || [];
      return debts.map(debtToViewModel);
    },
    enabled: !!userId && !isGuest,
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
 * Guest users: returns empty summary (no server call)
 */
export function useDebtSummary(userId: string | null) {
  const isGuest = userId ? isGuestId(userId) : false;

  return useQuery({
    queryKey: debtKeys.summary(userId || ''),
    queryFn: async () => {
      // Guest users: return empty summary
      if (isGuest) {
        return {
          totalIOwe: 0,
          totalOwedToMe: 0,
          netBalance: 0,
          activeDebtsCount: 0,
          iOweCount: 0,
          owedToMeCount: 0,
        } as DebtSummary;
      }

      const response = await apiClient.get<DebtSummary>(
        API_ENDPOINTS.DEBTS.SUMMARY(userId!)
      );

      return response.data;
    },
    enabled: !!userId && !isGuest,
  });
}
