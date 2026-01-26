import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Debt, CreateDebtDTO, UpdateDebtDTO, PayDebtDTO, DebtPayment } from '@/shared/types';
import { debtKeys } from './keys';
import { isGuestId } from '@/shared/lib/utils/guestId';
import { haptic } from '@/shared/lib/haptic';

/**
 * Error thrown when guest user tries to access server features
 */
export class GuestAccessError extends Error {
  constructor(feature: string) {
    super(`Для ${feature} необходимо войти через Telegram`);
    this.name = 'GuestAccessError';
  }
}

/**
 * Hook to create a new debt
 * Guest users: throws GuestAccessError
 */
export function useCreateDebt(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateDebtDTO) => {
      // Block guest users
      if (isGuestId(userId)) {
        throw new GuestAccessError('создания долгов');
      }

      const response = await apiClient.post<Debt>(
        API_ENDPOINTS.DEBTS.CREATE(userId),
        data
      );
      return response.data;
    },
    onSuccess: () => {
      haptic.success();
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
      haptic.success();
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.detail(debtId) });
    },
  });
}

/**
 * Hook to delete a debt
 * Guest users: throws GuestAccessError
 */
export function useDeleteDebt(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (debtId: string) => {
      if (isGuestId(userId)) {
        throw new GuestAccessError('удаления долгов');
      }
      await apiClient.delete(API_ENDPOINTS.DEBTS.DELETE(debtId));
    },
    onSuccess: () => {
      haptic.warning();
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.summary(userId) });
    },
  });
}

/**
 * Hook to cancel a debt
 * Guest users: throws GuestAccessError
 */
export function useCancelDebt(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (debtId: string) => {
      if (isGuestId(userId)) {
        throw new GuestAccessError('отмены долгов');
      }
      const response = await apiClient.post<Debt>(
        API_ENDPOINTS.DEBTS.CANCEL(debtId)
      );
      return response.data;
    },
    onSuccess: (_, debtId) => {
      haptic.warning();
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.detail(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.summary(userId) });
    },
  });
}

/**
 * Hook to make a payment on a debt
 * Guest users: throws GuestAccessError
 */
export function usePayDebt(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ debtId, data }: { debtId: string; data: PayDebtDTO }) => {
      if (isGuestId(userId)) {
        throw new GuestAccessError('оплаты долгов');
      }
      const response = await apiClient.post<DebtPayment>(
        API_ENDPOINTS.DEBTS.PAY(debtId),
        data
      );
      return response.data;
    },
    onSuccess: (_, { debtId }) => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.detail(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.withPayments(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.summary(userId) });
    },
  });
}

/**
 * Hook to pay off a debt in full
 * Guest users: throws GuestAccessError
 */
export function usePayDebtFull(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ debtId, note, createTransaction = true }: { debtId: string; note?: string; createTransaction?: boolean }) => {
      if (isGuestId(userId)) {
        throw new GuestAccessError('оплаты долгов');
      }
      const response = await apiClient.post<DebtPayment>(
        API_ENDPOINTS.DEBTS.PAY_FULL(debtId),
        { note, createTransaction }
      );
      return response.data;
    },
    onSuccess: (_, { debtId }) => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.detail(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.withPayments(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.summary(userId) });
    },
  });
}

/**
 * Hook to delete a payment
 * Guest users: throws GuestAccessError
 */
export function useDeletePayment(userId: string, debtId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (paymentId: string) => {
      if (isGuestId(userId)) {
        throw new GuestAccessError('удаления платежей');
      }
      await apiClient.delete(API_ENDPOINTS.DEBTS.DELETE_PAYMENT(paymentId));
    },
    onSuccess: () => {
      haptic.warning();
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.detail(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.withPayments(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.summary(userId) });
    },
  });
}
