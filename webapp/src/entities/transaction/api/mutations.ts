import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Transaction, CreateTransactionDTO, UpdateTransactionDTO } from '@/shared/types';
import type { TransactionViewModel } from '../model/types';
import { transactionKeys } from './keys';
import { budgetKeys } from '@/entities/budget/api/keys';
import { subscriptionKeys } from '@/entities/subscription/api/keys';
import { findCategory, GUEST_CATEGORIES } from '@/entities/category';
import { transactionToViewModel } from '../lib/toViewModel';
import { transactionDataSource } from '@/shared/lib/db';
import type { LocalTransaction, UpdateLocalTransactionDTO } from '@/shared/lib/db/schema';
import { isGuestId } from '@/shared/lib/utils/guestId';
import { haptic } from '@/shared/lib/haptic';
import { balanceReaderKeys } from './balanceReaders';

/** Home's balances, month totals and recent records move with every change of records (FT-111). */
function invalidateBalanceReaders(queryClient: QueryClient, userId: string): void {
  for (const queryKey of balanceReaderKeys(userId)) queryClient.invalidateQueries({ queryKey });
}

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
 * Convert LocalTransaction to Transaction format for React Query cache
 */
function localToTransaction(local: LocalTransaction): Transaction {
  return {
    id: local.id,
    date: local.date,
    category: local.category,
    categoryId: local.categoryId,
    categoryColor: local.categoryColor,
    description: local.description,
    amount: local.amount,
    type: local.type,
    semanticType: local.semanticType,
    needsReview: local.needsReview,
    userId: local.userId,
    merchant: local.merchant,
    createdAt: new Date(local.localCreatedAt).toISOString(),
    isArchived: local.isArchived,
  };
}

/**
 * Hook to create a new transaction
 * Guest: IndexedDB, Telegram: Server API
 */
export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateTransactionDTO) => {
      // Use dataSource - handles guest (IndexedDB) vs telegram (server API)
      const localTx = await transactionDataSource.create({
        date: data.date,
        category: data.category,
        categoryId: data.categoryId,
        description: data.description,
        amount: data.amount,
        type: data.type,
        semanticType: data.semanticType,
        needsReview: data.needsReview,
        userId: data.userId,
        merchant: data.merchant,
        amountMinor: data.amountMinor,
        currency: data.currency,
        accountId: data.accountId,
        clientId: data.clientId,
      });
      return localToTransaction(localTx);
    },
    onSuccess: (newTransaction, variables) => {
      // Haptic feedback for successful creation
      haptic.success();

      const userId = variables.userId;

      // 1. Add to transaction list immediately (NO HTTP request)
      queryClient.setQueryData<TransactionViewModel[]>(
        transactionKeys.list(userId),
        (old) => {
          const newItem = transactionToViewModel(newTransaction);
          if (!old) return [newItem];
          return [newItem, ...old];
        }
      );

      // 2. Invalidate ONLY computed data that depends on transaction totals
      queryClient.invalidateQueries({ queryKey: budgetKeys.summaries(userId) });
      invalidateBalanceReaders(queryClient, userId);
      // Invalidate subscription to refresh usage limits (transaction count increased)
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.status(userId) });
    },
  });
}

/**
 * Hook to update an existing transaction
 * Guest: IndexedDB, Telegram: Server API
 */
export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; userId: string; data: UpdateTransactionDTO }) => {
      // Use dataSource - handles guest (IndexedDB) vs telegram (server API)
      const localTx = await transactionDataSource.update(id, {
        date: data.date,
        category: data.category,
        categoryId: data.categoryId,
        description: data.description,
        amount: data.amount,
        type: data.type,
        semanticType: data.semanticType,
        needsReview: data.needsReview,
        merchant: data.merchant,
      });
      if (!localTx) {
        throw new Error('Transaction not found');
      }
      return localToTransaction(localTx);
    },
    onSuccess: (updatedTransaction, variables) => {
      // Haptic feedback for successful update
      haptic.success();

      // Use userId from variables for reliable cache key targeting
      const userId = variables.userId;

      // 1. Update transaction in list cache (NO HTTP request)
      queryClient.setQueryData<TransactionViewModel[]>(
        transactionKeys.list(userId),
        (old) => {
          if (!old) return old;
          return old.map((t) =>
            t.id === updatedTransaction.id ? transactionToViewModel(updatedTransaction) : t
          );
        }
      );

      // 2. Update detail cache if it exists
      queryClient.setQueryData(
        transactionKeys.detail(updatedTransaction.id!),
        transactionToViewModel(updatedTransaction)
      );

      // 3. Invalidate computed data (amount/category might have changed)
      queryClient.invalidateQueries({ queryKey: budgetKeys.summaries(userId) });
      invalidateBalanceReaders(queryClient, userId);
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

/** Takes a deleted record out of every cache it was in and refetches what it counted in. */
function forgetDeletedTransaction(queryClient: QueryClient, { id, userId }: { id: string; userId: string }): void {
  // 1. Remove from transaction list cache (NO HTTP request)
  queryClient.setQueryData<TransactionViewModel[]>(
    transactionKeys.list(userId),
    (old) => {
      if (!old) return old;
      return old.filter((t) => t.id !== id);
    }
  );

  // 2. Remove from detail cache
  queryClient.removeQueries({ queryKey: transactionKeys.detail(id) });
  forgetRecordRead(queryClient, id);

  // 3. Invalidate computed data
  queryClient.invalidateQueries({ queryKey: budgetKeys.summaries(userId) });
  invalidateBalanceReaders(queryClient, userId);
  // Invalidate subscription to refresh usage limits (transaction count decreased)
  queryClient.invalidateQueries({ queryKey: subscriptionKeys.status(userId) });
}

/**
 * Deletes a record — softly on the server (FT-105), from the device for a guest — and refreshes what showed
 * it. Not a hook: «Отменить» in a toast runs it after the screen that wrote the record is gone (FT-113).
 */
export async function deleteTransaction(queryClient: QueryClient, variables: { id: string; userId: string }): Promise<void> {
  await transactionDataSource.delete(variables.id);
  forgetDeletedTransaction(queryClient, variables);
}

/**
 * Brings a deleted record back (FT-105: `POST /api/transactions/:id/restore`; a guest's record is put back on
 * the device, FT-115) and refreshes what counts it. Not a hook, like `deleteTransaction`: «Отменить» in a toast
 * runs it.
 */
export async function restoreTransaction(queryClient: QueryClient, { id, userId }: { id: string; userId: string }): Promise<void> {
  await transactionDataSource.restore(id);
  const known = deletedRecords.get(id);
  deletedRecords.delete(id);
  if (known) queryClient.setQueryData(transactionKeys.record(id), known);
  refetchAfterChange(queryClient, userId);
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
 * A guest's device record has no account or currency (сум only), keeps its amount in сум and the name of its
 * category next to the id (the old History list shows the name); guest mode goes with FT-128 (decision Д4).
 */
function toDeviceUpdate(patch: TransactionPatch): UpdateLocalTransactionDTO {
  const update: UpdateLocalTransactionDTO = {};
  if ('amountMinor' in patch) update.amount = patch.amountMinor / 100;
  if ('categoryId' in patch) {
    update.categoryId = patch.categoryId;
    const category = findCategory(GUEST_CATEGORIES, patch.categoryId);
    if (category) update.category = category.name;
  }
  if ('date' in patch) update.date = patch.date;
  if ('description' in patch) update.description = patch.description;
  if ('type' in patch) {
    update.type = patch.type;
    update.semanticType = patch.semanticType;
  }
  return update;
}

/**
 * Changes a saved record at once (the AI review of FT-114, the record sheet of FT-115) and refreshes what shows
 * it. A signed-in user's record is changed on the server, whose answer becomes the record the sheet shows; a
 * guest's on the device.
 */
export async function patchTransaction(
  queryClient: QueryClient,
  { id, userId, patch }: { id: string; userId: string; patch: TransactionPatch }
): Promise<void> {
  let saved: Transaction;
  if (isGuestId(userId)) {
    const local = await transactionDataSource.update(id, toDeviceUpdate(patch));
    if (!local) throw { statusCode: 404, message: 'Transaction not found' };
    saved = localToTransaction(local);
  } else {
    const response = await apiClient.put<Transaction>(API_ENDPOINTS.TRANSACTIONS.UPDATE(id), patch);
    saved = response.data;
  }
  queryClient.removeQueries({ queryKey: transactionKeys.detail(id) });
  queryClient.setQueryData(transactionKeys.record(id), saved);
  refetchAfterChange(queryClient, userId);
}

/** Everything a written, changed, deleted or restored record moves; the server computes it. */
function refetchAfterChange(queryClient: QueryClient, userId: string): void {
  queryClient.invalidateQueries({ queryKey: transactionKeys.list(userId) });
  queryClient.invalidateQueries({ queryKey: budgetKeys.summaries(userId) });
  invalidateBalanceReaders(queryClient, userId);
  queryClient.invalidateQueries({ queryKey: subscriptionKeys.status(userId) });
}
