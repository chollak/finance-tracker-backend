import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Debt, CreateDebtDTO, UpdateDebtDTO, PayDebtDTO, DebtPayment } from '@/shared/types';
import { balanceReaderKeys, transactionKeys } from '@/entities/transaction';
import { debtKeys } from './keys';
import { haptic } from '@/shared/lib/haptic';

/**
 * What a debt's linked record moves besides the debts (FT-111 review): a debt created with the money
 * handed over and every payment write a record to an account, so Home's balances, month totals and recent
 * records change, and so does the user's record list. Deleting or cancelling a debt and deleting a payment
 * leave the linked records where they are (the backend does not remove them), so those refresh the debts only.
 */
export function linkedRecordKeys(userId: string): QueryKey[] {
  return [...balanceReaderKeys(userId), transactionKeys.list(userId)];
}

function refreshLinkedRecords(queryClient: QueryClient, userId: string): void {
  for (const queryKey of linkedRecordKeys(userId)) queryClient.invalidateQueries({ queryKey });
}

/** Options of `useCreateDebt`, apart so a test can run them on its own client. */
export function createDebtMutation(
  queryClient: QueryClient,
  userId: string
): UseMutationOptions<Debt, Error, CreateDebtDTO> {
  return {
    mutationFn: async (data) => {
      const response = await apiClient.post<Debt>(
        API_ENDPOINTS.DEBTS.CREATE(userId),
        data
      );
      return response.data;
    },
    onSuccess: (_, data) => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.summary(userId) });
      // The backend writes a linked record only when the money was handed over
      if (data.moneyTransferred) refreshLinkedRecords(queryClient, userId);
    },
  };
}

/**
 * Hook to create a new debt
 */
export function useCreateDebt(userId: string) {
  const queryClient = useQueryClient();
  return useMutation(createDebtMutation(queryClient, userId));
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
 */
export function useDeleteDebt(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (debtId: string) => {
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
      haptic.warning();
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.detail(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.summary(userId) });
    },
  });
}

/** Options of `usePayDebt`, apart so a test can run them on its own client. */
export function payDebtMutation(
  queryClient: QueryClient,
  userId: string
): UseMutationOptions<DebtPayment, Error, { debtId: string; data: PayDebtDTO }> {
  return {
    mutationFn: async ({ debtId, data }) => {
      const response = await apiClient.post<DebtPayment>(
        API_ENDPOINTS.DEBTS.PAY(debtId),
        data
      );
      return response.data;
    },
    onSuccess: (_, { debtId, data }) => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.detail(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.withPayments(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.summary(userId) });
      // The backend writes a linked record unless asked not to
      if (data.createTransaction !== false) refreshLinkedRecords(queryClient, userId);
    },
  };
}

/**
 * Hook to make a payment on a debt
 */
export function usePayDebt(userId: string) {
  const queryClient = useQueryClient();
  return useMutation(payDebtMutation(queryClient, userId));
}

/** Options of `usePayDebtFull`, apart so a test can run them on its own client. */
export function payDebtFullMutation(
  queryClient: QueryClient,
  userId: string
): UseMutationOptions<DebtPayment, Error, { debtId: string; note?: string; createTransaction?: boolean }> {
  return {
    mutationFn: async ({ debtId, note, createTransaction = true }) => {
      const response = await apiClient.post<DebtPayment>(
        API_ENDPOINTS.DEBTS.PAY_FULL(debtId),
        { note, createTransaction }
      );
      return response.data;
    },
    onSuccess: (_, { debtId, createTransaction = true }) => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.detail(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.withPayments(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.summary(userId) });
      if (createTransaction) refreshLinkedRecords(queryClient, userId);
    },
  };
}

/**
 * Hook to pay off a debt in full
 */
export function usePayDebtFull(userId: string) {
  const queryClient = useQueryClient();
  return useMutation(payDebtFullMutation(queryClient, userId));
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
      haptic.warning();
      queryClient.invalidateQueries({ queryKey: debtKeys.lists() });
      queryClient.invalidateQueries({ queryKey: debtKeys.detail(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.withPayments(debtId) });
      queryClient.invalidateQueries({ queryKey: debtKeys.summary(userId) });
    },
  });
}
