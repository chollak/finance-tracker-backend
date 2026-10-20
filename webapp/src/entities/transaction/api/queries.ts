import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Transaction } from '@/shared/types';
import { transactionToViewModel } from '../lib/toViewModel';
import { transactionKeys } from './keys';
import { transactionDataSource } from '@/shared/lib/db';
import type { LocalTransaction } from '@/shared/lib/db/schema';
import { useUserStore } from '@/entities/user';
import type { FrequentRecord, HistoryPage, HistoryQuery, PeriodTotals } from '../model/types';
import { deviceHistoryPage, parseHistorySearch } from '../lib/historySearch';

/**
 * Convert LocalTransaction to Transaction format
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
 * Hook to fetch all transactions for a user
 * Offline-first: reads from IndexedDB for guest, hybrid mode for authenticated
 */
export function useTransactions(userId: string | null) {
  return useQuery({
    queryKey: transactionKeys.list(userId || ''),
    queryFn: async () => {
      // Use dataSource - handles guest (local only) vs telegram (hybrid) modes
      const localTransactions = await transactionDataSource.getAll();

      // Convert to Transaction format, then to ViewModels
      const transactions = localTransactions.map(localToTransaction);
      return transactions.map(transactionToViewModel);
    },
    enabled: !!userId,
  });
}

/**
 * One record as the record sheet shows and changes it (FT-115): `GET /api/transactions/:id` for a signed-in
 * user — the whole record, with its amount in minor units, currency, account and category id — or the device
 * record of a guest. `placeholder` is the record as the list that opened it has it, shown until the read
 * answers; TanStack drops it when the read fails, so a caller that must keep showing it keeps it itself. A record
 * that is gone answers with an error (`statusCode: 404` from the server).
 *
 * `cachedOnly` — the record only as it is known here (what the record sheet read or saved), never read for this
 * caller: History's record just changed is gone with its delete and back with «Отменить», without asking the server
 * for a record that is no more.
 */
export function useRecord(id: string | null, placeholder?: Transaction, { cachedOnly = false }: { cachedOnly?: boolean } = {}) {
  const userType = useUserStore((state) => state.userType);

  return useQuery({
    queryKey: transactionKeys.record(id ?? ''),
    queryFn: async (): Promise<Transaction> => {
      if (userType === 'guest') {
        const local = await transactionDataSource.getById(id!);
        if (!local) throw { statusCode: 404, message: 'Transaction not found' };
        return localToTransaction(local);
      }
      const response = await apiClient.get<Transaction>(API_ENDPOINTS.TRANSACTIONS.DETAIL(id!));
      return response.data;
    },
    enabled: !!id && userType !== null && !cachedOnly,
    placeholderData: placeholder,
    retry: false,
  });
}

/**
 * The newest records of the signed-in user — the recent list on Home (FT-111). Read through the history
 * API (FT-107: the user from authentication, newest first by date and time of creation), so every record
 * carries its amount in minor units, its currency and its category id. Guests read the device's records.
 */
export function useRecentRecords(limit: number) {
  const userId = useUserStore((state) => state.userId);
  const userType = useUserStore((state) => state.userType);

  return useQuery({
    queryKey: transactionKeys.recent(userId ?? '', limit),
    queryFn: async (): Promise<Transaction[]> => {
      if (userType === 'guest') {
        const local = await transactionDataSource.getAll();
        return local
          .map(localToTransaction)
          .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
          .slice(0, limit);
      }
      const response = await apiClient.get<{ items: Transaction[]; nextCursor: string | null }>(
        API_ENDPOINTS.TRANSACTIONS.HISTORY({ limit })
      );
      return response.data?.items ?? [];
    },
    enabled: !!userId && userType !== null,
  });
}

/**
 * Income and expenses of a period (FT-111: the month tiles and the line under the balance), from the
 * backend's one totals service. Guests have no server totals, so the query does not run for them.
 */
export function usePeriodTotals(range: { from: string; to: string }) {
  const userId = useUserStore((state) => state.userId);
  const userType = useUserStore((state) => state.userType);

  return useQuery({
    queryKey: transactionKeys.totals(userId ?? '', range),
    queryFn: async (): Promise<PeriodTotals> => {
      const response = await apiClient.get<PeriodTotals>(API_ENDPOINTS.TRANSACTIONS.TOTALS(range));
      return response.data;
    },
    enabled: !!userId && userType === 'telegram',
  });
}

/**
 * The user's frequent expenses for the quick chips over the composer (FT-114), by the backend's rule (up to 6
 * «category + note + amount» of the last 30 days, each written at least 3 times). Guests have no server
 * records, so the query does not run for them.
 */
export function useFrequentRecords() {
  const userId = useUserStore((state) => state.userId);
  const userType = useUserStore((state) => state.userType);

  return useQuery({
    queryKey: transactionKeys.frequent(userId ?? ''),
    queryFn: async (): Promise<FrequentRecord[]> => {
      const response = await apiClient.get<{ items: FrequentRecord[] }>(API_ENDPOINTS.TRANSACTIONS.FREQUENT);
      return response.data?.items ?? [];
    },
    enabled: !!userId && userType === 'telegram',
  });
}

/**
 * History (FT-116): the records the search and the filters find, newest first, a page at a time —
 * `GET /api/transactions` with `q`, `categoryIds`, `accountIds`, `type` and the cursor of the page before (FT-107; the user
 * from authentication). The first page of a narrowed History sums up all it found. While a new search is read the
 * list of the one before stays on screen. Guests search the device's records here, by the same rules.
 */
export function useRecordHistory(query: HistoryQuery) {
  const userId = useUserStore((state) => state.userId);
  const userType = useUserStore((state) => state.userType);
  // «такси» and «такси » are one search
  const normalized: HistoryQuery = { ...query, text: parseHistorySearch(query.text) ? query.text.trim() : '' };

  return useInfiniteQuery({
    queryKey: transactionKeys.history(userId ?? '', normalized),
    queryFn: async ({ pageParam }): Promise<HistoryPage> => {
      if (userType === 'guest') {
        const local = await transactionDataSource.getAll();
        return deviceHistoryPage(local.map(localToTransaction), normalized);
      }
      const response = await apiClient.get<HistoryPage>(
        API_ENDPOINTS.TRANSACTIONS.HISTORY({
          q: normalized.text || undefined,
          categoryIds: normalized.categoryId ? [normalized.categoryId] : undefined,
          accountIds: normalized.accountId ? [normalized.accountId] : undefined,
          type: normalized.type ?? undefined,
          cursor: pageParam ?? undefined,
        })
      );
      return {
        items: response.data?.items ?? [],
        nextCursor: response.data?.nextCursor ?? null,
        summary: response.data?.summary ?? null,
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
    enabled: !!userId && userType !== null,
  });
}
