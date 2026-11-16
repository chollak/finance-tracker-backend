import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Transaction, CreateTransactionDTO } from '@/shared/types';
import { transactionKeys } from './keys';
import { subscriptionKeys } from '@/entities/subscription/api/keys';
import { haptic } from '@/shared/lib/haptic';
import { balanceReaderKeys } from './balanceReaders';
import { createRecord, deleteRecord, restoreRecord } from './serverRecords';

/** Home's balances, month totals and recent records move with every change of records (FT-111). */
function invalidateBalanceReaders(queryClient: QueryClient, userId: string): void {
  for (const queryKey of balanceReaderKeys(userId)) queryClient.invalidateQueries({ queryKey });
}

/**
 * Writes a record on the server: manual entry (FT-113) and the quick chips (FT-114). What shows records is read again —
 * the server computes balances and totals, so nothing is patched into the cache.
 */
export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTransactionDTO) => createRecord(data),
    onSuccess: (_saved, variables) => {
      haptic.success();
      refreshAfterRecordsChanged(queryClient, variables.userId);
    },
  });
}

/**
 * Records deleted here, as they were known when deleted (FT-116): «Отменить» brings a record back unchanged, so its
 * copy is known again at once — History shows the record just changed back in its list without reading it.
 */
const deletedRecords = new Map<string, Transaction>();

/**
 * The record as the record sheet read it is forgotten. Whoever shows it sees it gone at once, and nothing is sent
 * to read it again: a reader still on screen (History's record just changed, the sheet that is closing) is left
 * with no record rather than a fresh query that would ask the server for a deleted one.
 */
function forgetRecordRead(queryClient: QueryClient, id: string): void {
  const query = queryClient.getQueryCache().find<Transaction>({ queryKey: transactionKeys.record(id), exact: true });
  const known = query?.state.data;
  if (known) deletedRecords.set(id, known);
  else deletedRecords.delete(id);
  if (!query) return;
  query.reset();
  if (query.getObserversCount() === 0) queryClient.removeQueries({ queryKey: transactionKeys.record(id), exact: true });
}

/**
 * Deletes a record — softly on the server (FT-105) — takes it out of the cache it was read into and refreshes what
 * showed it. Not a hook: «Отменить» in a toast runs it after the screen that wrote the record is gone (FT-113).
 */
export async function deleteTransaction(queryClient: QueryClient, { id, userId }: { id: string; userId: string }): Promise<void> {
  await deleteRecord(id);
  forgetRecordRead(queryClient, id);
  refreshAfterRecordsChanged(queryClient, userId);
}

/**
 * Brings a deleted record back (FT-105: `POST /api/transactions/:id/restore`) and refreshes what counts it. Not a
 * hook, like `deleteTransaction`: «Отменить» in a toast runs it.
 */
export async function restoreTransaction(queryClient: QueryClient, { id, userId }: { id: string; userId: string }): Promise<void> {
  await restoreRecord(id);
  const known = deletedRecords.get(id);
  deletedRecords.delete(id);
  if (known) queryClient.setQueryData(transactionKeys.record(id), known);
  refreshAfterRecordsChanged(queryClient, userId);
}

/**
 * A change of a saved record, as `PUT /api/transactions/:id` takes it (docs/pastel/api.md): one field, or the
 * fields that move together — an account with its currency, a type with a category of that type and its
 * meaning (the record sheet's «Расход / Доход», FT-115).
 */
export type TransactionPatch =
  | { categoryId: string }
  | { accountId: string; currency: 'UZS' | 'USD' }
  | { date: string }
  | { amountMinor: number }
  | { description: string }
  | { type: 'income' | 'expense'; categoryId: string; semanticType: 'income' | 'expense' };

/**
 * Changes a saved record at once (the AI review of FT-114, the record sheet of FT-115) and refreshes what shows
 * it. The record is changed on the server, whose answer becomes the record the sheet shows.
 */
export async function patchTransaction(
  queryClient: QueryClient,
  { id, userId, patch }: { id: string; userId: string; patch: TransactionPatch }
): Promise<void> {
  const response = await apiClient.put<Transaction>(API_ENDPOINTS.TRANSACTIONS.UPDATE(id), patch);
  queryClient.setQueryData(transactionKeys.record(id), response.data);
  refreshAfterRecordsChanged(queryClient, userId);
}

/**
 * Everything a written, changed, deleted or restored record moves; the server computes it. The outbox (FT-129) runs it
 * after it sent what was written without a connection.
 *
 * Each reader once: invalidated twice in a row, a query is read twice — the second read cancels the first, but
 * `apiClient` gives `fetch` no signal, so both reach the server (#288).
 */
export function refreshAfterRecordsChanged(queryClient: QueryClient, userId: string): void {
  invalidateBalanceReaders(queryClient, userId);
  // Usage limits count records (limits are off, decision Д3; their screens wait for #319)
  queryClient.invalidateQueries({ queryKey: subscriptionKeys.status(userId) });
}
