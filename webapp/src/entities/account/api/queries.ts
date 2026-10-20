import { useState } from 'react';
import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import { toLocalDate } from '@/shared/lib/dates';
import { useUserStore } from '@/entities/user';
import { firstOperationsWindow, mergeOperationWindows, nextOperationsWindow, type OperationsWindow } from '../lib/operationWindows';
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
 * (`GET /api/accounts/:id/operations`), read in windows of 60 days back in time — the next one when the list comes
 * near its end (`fetchNextPage`). `data` is the windows read so far as one list. An account that is not the user's is
 * a 404 — asked once, not retried.
 */
export function useAccountOperations(accountId: string | undefined) {
  const userId = useUserStore((state) => state.userId);
  const userType = useUserStore((state) => state.userType);
  const [first] = useState(() => firstOperationsWindow(toLocalDate(new Date())));

  return useInfiniteQuery<AccountOperations, ApiError, AccountOperations, readonly unknown[], OperationsWindow>({
    queryKey: accountKeys.operations(userId ?? '', accountId ?? ''),
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<AccountOperations>(
        API_ENDPOINTS.ACCOUNTS.OPERATIONS(accountId!, { from: pageParam.from, to: pageParam.to ?? undefined })
      );
      return response.data;
    },
    initialPageParam: first,
    getNextPageParam: (last) => nextOperationsWindow(last),
    select: (data: InfiniteData<AccountOperations, OperationsWindow>) => mergeOperationWindows(data.pages),
    enabled: !!userId && userType === 'telegram' && !!accountId,
    retry: (count, error) => error.statusCode !== 404 && count < 2,
  });
}
