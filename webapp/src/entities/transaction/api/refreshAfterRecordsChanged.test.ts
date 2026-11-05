import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import { transactionDataSource } from '@/shared/lib/db';
import { memoryOfflineStorage, setOfflineStorage, useConnectivityStore, useOutboxStore } from '@/shared/lib/offline';
import { useUserStore } from '@/entities/user';
import { accountKeys } from '@/entities/account';
import { analyticsKeys } from '@/entities/analytics';
import { auditKeys } from '@/entities/audit';
import { subscriptionKeys } from '@/entities/subscription/api/keys';
import type { Transaction } from '@/shared/types';
import type { QueuedRecordInput } from '../model/outbox';
import { transactionKeys } from './keys';
import { patchTransaction, restoreTransaction } from './mutations';
import { flushRecordOutbox, queueRecords } from './recordOutbox';

/**
 * #288: a changed, restored or sent record refreshes every reader it moves, and each one is read once. Two invalidations
 * of one query in a row each start a read — the second cancels the first, but `apiClient` gives `fetch` no signal, so
 * both reach the server.
 */

vi.mock('@/shared/api/client', () => ({ apiClient: { put: vi.fn(), post: vi.fn(), delete: vi.fn(), get: vi.fn() } }));
vi.mock('@/shared/lib/db', () => ({ transactionDataSource: { restore: vi.fn(), delete: vi.fn() } }));

const USER = '900000001';
const WHOLE_HISTORY = { text: '', categoryId: null, accountId: null, type: null };

/** What Home, History, Analytics and the audit have on screen while a record changes. */
const ON_SCREEN = {
  accounts: accountKeys.list(USER),
  monthTotals: transactionKeys.totals(USER, { from: '2026-10-01', to: '2026-10-31' }),
  recent: transactionKeys.recent(USER, 5),
  frequent: transactionKeys.frequent(USER),
  history: transactionKeys.history(USER, WHOLE_HISTORY),
  analytics: analyticsKeys.month(USER, undefined, 'expense'),
  audit: auditKeys.current(USER),
  subscription: subscriptionKeys.status(USER),
  // `useTransactions`: the whole list, the key every other list of records is under
  wholeList: transactionKeys.list(USER),
} satisfies Record<string, QueryKey>;

const READ_ONCE = Object.fromEntries(Object.keys(ON_SCREEN).map((name) => [name, 1]));

/** Read before and not on screen now: each must be read again once it opens. */
const CLOSED: QueryKey[] = [
  transactionKeys.recent(USER, 20),
  transactionKeys.history(USER, { ...WHOLE_HISTORY, text: 'такси' }),
  transactionKeys.totals(USER, { from: '2026-09-01', to: '2026-09-30' }),
  analyticsKeys.category(USER, 'c-cafe', '2026-10'),
  auditKeys.goals(USER),
];

const SAVED: Transaction = {
  id: 't4', type: 'expense', amount: 145000, amountMinor: 14_500_000, currency: 'UZS', category: 'Кафе', categoryId: 'c-cafe',
  accountId: 'card', date: '2026-10-14', description: 'Обед с командой', userId: USER,
};
const TAXI: QueuedRecordInput = {
  type: 'expense', amountMinor: 1_800_000, currency: 'UZS', accountId: 'card', categoryId: 'c-tr', categoryName: 'Транспорт',
  date: '2026-10-14', note: 'Такси',
};

let client: QueryClient;
let reads: Map<keyof typeof ON_SCREEN, number>;
let stopReaders: Array<() => void>;

const settled = () => vi.waitFor(() => expect(client.isFetching()).toBe(0));
const readsSinceOpen = () => Object.fromEntries(Object.keys(ON_SCREEN).map((name) => [name, reads.get(name as keyof typeof ON_SCREEN) ?? 0]));

/** Each reader on screen is a query with an observer, as a mounted `useQuery` is; its read counts the requests. */
async function openScreens(): Promise<void> {
  stopReaders = Object.entries(ON_SCREEN).map(([name, queryKey]) =>
    new QueryObserver(client, {
      queryKey,
      queryFn: async () => {
        reads.set(name as keyof typeof ON_SCREEN, (reads.get(name as keyof typeof ON_SCREEN) ?? 0) + 1);
        return {};
      },
    }).subscribe(() => undefined)
  );
  for (const queryKey of CLOSED) client.setQueryData(queryKey, {});
  await settled();
  reads.clear();
}

beforeEach(async () => {
  setOfflineStorage(memoryOfflineStorage());
  useOutboxStore.setState({ entries: [] });
  useConnectivityStore.setState({ browserOnline: true, lost: false });
  useUserStore.setState({ userId: USER, userType: 'telegram' });
  vi.mocked(apiClient.put).mockReset().mockResolvedValue({ data: SAVED });
  vi.mocked(apiClient.post).mockReset().mockResolvedValue({ data: { id: 'srv-1' } });
  vi.mocked(transactionDataSource.restore).mockReset().mockResolvedValue(undefined);
  client = new QueryClient();
  reads = new Map();
  await openScreens();
});

afterEach(() => {
  for (const stop of stopReaders) stop();
  client.clear();
});

describe('a change of records reads each reader once (#288)', () => {
  it('a change in the record sheet or the review of records', async () => {
    await patchTransaction(client, { id: 't4', userId: USER, patch: { categoryId: 'c-pr' } });
    await settled();

    expect(readsSinceOpen()).toEqual(READ_ONCE);
    expect(CLOSED.map((queryKey) => client.getQueryState(queryKey)?.isInvalidated)).toEqual(CLOSED.map(() => true));
  });

  it('«Отменить» after a delete', async () => {
    await restoreTransaction(client, { id: 't4', userId: USER });
    await settled();

    expect(readsSinceOpen()).toEqual(READ_ONCE);
    expect(CLOSED.map((queryKey) => client.getQueryState(queryKey)?.isInvalidated)).toEqual(CLOSED.map(() => true));
  });

  it('the outbox sent what was written without a connection', async () => {
    queueRecords(USER, [TAXI]);

    await flushRecordOutbox(client, USER);
    await settled();

    expect(readsSinceOpen()).toEqual(READ_ONCE);
    expect(CLOSED.map((queryKey) => client.getQueryState(queryKey)?.isInvalidated)).toEqual(CLOSED.map(() => true));
  });
});
