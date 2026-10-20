import { useQuery } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import { useUserStore } from '@/entities/user';
import type { AccountOperations, AccountsOverview } from '../model/types';
import { accountKeys } from './keys';

/**
 * The signed-in user's accounts with balances and the total (`GET /api/accounts`; the user comes from
 * authentication). Guests keep records on the device and have no accounts, so the query does not run.
 */
export function useAccounts() {
  const userId = useUserStore((state) => state.userId);
  const userType = useUserStore((state) => state.userType);

  return useQuery({
    queryKey: accountKeys.list(userId ?? ''),
    queryFn: async (): Promise<AccountsOverview> => {
      const response = await apiClient.get<AccountsOverview>(API_ENDPOINTS.ACCOUNTS.LIST);
      return response.data;
    },
    enabled: !!userId && userType === 'telegram',
  });
}

/**
 * One account's screen (FT-118): the account with its balance and its records and moves by day
 * (`GET /api/accounts/:id/operations`). An account that is not the user's is a 404 — asked once, not retried.
 */
export function useAccountOperations(accountId: string | undefined) {
  const userId = useUserStore((state) => state.userId);
  const userType = useUserStore((state) => state.userType);

  return useQuery<AccountOperations, ApiError>({
    queryKey: accountKeys.operations(userId ?? '', accountId ?? ''),
    queryFn: async () => {
      const response = await apiClient.get<AccountOperations>(API_ENDPOINTS.ACCOUNTS.OPERATIONS(accountId!));
      return response.data;
    },
    enabled: !!userId && userType === 'telegram' && !!accountId,
    retry: (count, error) => error.statusCode !== 404 && count < 2,
  });
}
