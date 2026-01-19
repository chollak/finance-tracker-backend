import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Debt, CreateDebtDTO, UpdateDebtDTO, PayDebtDTO, DebtPayment } from '@/shared/types';
import { debtKeys } from './keys';

/**
 * Hook to create a new debt
 */
export function useCreateDebt(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateDebtDTO) => {
      const response = await apiClient.post<Debt>(
        API_ENDPOINTS.DEBTS.CREATE(userId),
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.summary(userId) });
    },
  });
}

/**
 * Hook to update a debt
 */
export function useUpdateDebt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ debtId, data }: { debtId: string; data: UpdateDebtDTO }) => {
      const response = await apiClient.put<Debt>(
        API_ENDPOINTS.DEBTS.UPDATE(debtId),
        data
      );
      return response.data;
    },
    onSuccess: (_, { debtId }) => {
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.detail(debtId) });
    },
  });
}

/**
 * Hook to delete a debt
 */
export function useDeleteDebt(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (debtId: string) => {
      await apiClient.delete(API_ENDPOINTS.DEBTS.DELETE(debtId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.summary(userId) });
    },
  });
}

/**
 * Hook to cancel a debt
 */
export function useCancelDebt(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (debtId: string) => {
      const response = await apiClient.post<Debt>(
        API_ENDPOINTS.DEBTS.CANCEL(debtId)
      );
      return response.data;
    },
    onSuccess: (_, debtId) => {
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.detail(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.summary(userId) });
    },
  });
}

/**
 * Hook to make a payment on a debt
 */
export function usePayDebt(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ debtId, data }: { debtId: string; data: PayDebtDTO }) => {
      const response = await apiClient.post<DebtPayment>(
        API_ENDPOINTS.DEBTS.PAY(debtId),
        data
      );
      return response.data;
    },
    onSuccess: (_, { debtId }) => {
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.detail(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.withPayments(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.summary(userId) });
    },
  });
}

/**
 * Hook to pay off a debt in full
 */
export function usePayDebtFull(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ debtId, note, createTransaction = true }: { debtId: string; note?: string; createTransaction?: boolean }) => {
      const response = await apiClient.post<DebtPayment>(
        API_ENDPOINTS.DEBTS.PAY_FULL(debtId),
        { note, createTransaction }
      );
      return response.data;
    },
    onSuccess: (_, { debtId }) => {
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.detail(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.withPayments(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.summary(userId) });
    },
  });
}

/**
 * Hook to delete a payment
 */
export function useDeletePayment(userId: string, debtId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (paymentId: string) => {
      await apiClient.delete(API_ENDPOINTS.DEBTS.DELETE_PAYMENT(paymentId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.detail(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.withPayments(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.summary(userId) });
    },
  });
}
