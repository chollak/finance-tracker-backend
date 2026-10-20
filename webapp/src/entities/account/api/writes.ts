import type { QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Account, AccountMove, AccountPatch, NewAccount } from '../model/types';
import { accountKeys } from './keys';

/**
 * Writes of the accounts screen (FT-118). Not hooks: a sheet runs them and «Отменить» in a toast runs their
 * reverse. After each, every account read of the user — the list with its total, Home's balance card, the
 * account screens — is read again: the server computes balances, nothing is patched into the cache.
 */
function refetchAccounts(queryClient: QueryClient, userId: string): void {
  void queryClient.invalidateQueries({ queryKey: accountKeys.list(userId) });
}

export async function createAccount(queryClient: QueryClient, userId: string, account: NewAccount): Promise<Account> {
  const response = await apiClient.post<Account>(API_ENDPOINTS.ACCOUNTS.CREATE, account);
  refetchAccounts(queryClient, userId);
  return response.data;
}

/** Rename, hide or show; a new currency only with the balance entered again (no operations yet). */
export async function updateAccount(queryClient: QueryClient, userId: string, id: string, patch: AccountPatch): Promise<Account> {
  const response = await apiClient.patch<Account>(API_ENDPOINTS.ACCOUNTS.UPDATE(id), patch);
  refetchAccounts(queryClient, userId);
  return response.data;
}

/** «Сверить остаток»: what is really on the account; the server records the difference as an adjustment. */
export async function adjustBalance(
  queryClient: QueryClient,
  userId: string,
  { accountId, balanceMinor }: { accountId: string; balanceMinor: number }
): Promise<AccountMove> {
  const response = await apiClient.post<AccountMove>(API_ENDPOINTS.MOVES.CREATE, { kind: 'adjustment', accountId, balanceMinor });
  refetchAccounts(queryClient, userId);
  return response.data;
}

/** A transfer, an exchange or an adjustment deleted softly: both balances come back. */
export async function deleteMove(queryClient: QueryClient, userId: string, id: string): Promise<void> {
  await apiClient.delete<AccountMove>(API_ENDPOINTS.MOVES.DELETE(id));
  refetchAccounts(queryClient, userId);
}

/** «Отменить» after a delete. */
export async function restoreMove(queryClient: QueryClient, userId: string, id: string): Promise<void> {
  await apiClient.post<AccountMove>(API_ENDPOINTS.MOVES.RESTORE(id));
  refetchAccounts(queryClient, userId);
}
