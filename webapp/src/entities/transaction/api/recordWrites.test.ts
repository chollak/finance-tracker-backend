import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { transactionDataSource } from '@/shared/lib/db';
import type { Transaction } from '@/shared/types';
import { transactionKeys } from './keys';
import { deleteTransaction, patchTransaction, restoreTransaction } from './mutations';

/**
 * FT-115: the record sheet saves every change at once through `patchTransaction` and brings a deleted record
 * back through `restoreTransaction`. The record is the server's (PUT, POST restore).
 */

vi.mock('@/shared/api', () => ({ apiClient: { put: vi.fn(), post: vi.fn(), get: vi.fn() } }));
vi.mock('@/shared/lib/db', () => ({
  transactionDataSource: { update: vi.fn(), restore: vi.fn(), delete: vi.fn(), getById: vi.fn() },
}));

const SAVED: Transaction = {
  id: 't4', type: 'expense', amount: 145000, amountMinor: 14_500_000, currency: 'UZS', category: 'Кафе', categoryId: 'c-cafe',
  accountId: 'card', date: '2026-10-14', description: 'Обед с командой', userId: 'u1',
};

let client: QueryClient;

beforeEach(() => {
  vi.mocked(apiClient.put).mockReset();
  vi.mocked(apiClient.post).mockReset();
  vi.mocked(transactionDataSource.update).mockReset();
  vi.mocked(transactionDataSource.restore).mockReset();
  vi.mocked(transactionDataSource.delete).mockReset();
  client = new QueryClient();
});

describe('a change of a saved record (server)', () => {
  it('is one PUT of the changed fields; the answer becomes the record the sheet shows', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: SAVED });

    await patchTransaction(client, { id: 't4', userId: '900000001', patch: { date: '2026-10-14' } });

    expect(apiClient.put).toHaveBeenCalledWith('/transactions/t4', { date: '2026-10-14' });
    expect(client.getQueryData(transactionKeys.record('t4'))).toEqual(SAVED);
  });

  it('a new type goes with its category and its meaning', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: SAVED });

    await patchTransaction(client, { id: 't4', userId: '900000001', patch: { type: 'income', categoryId: 'c-zp', semanticType: 'income' } });

    expect(apiClient.put).toHaveBeenCalledWith('/transactions/t4', { type: 'income', categoryId: 'c-zp', semanticType: 'income' });
  });

  it('refreshes what shows the record: lists, balances, totals', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: SAVED });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await patchTransaction(client, { id: 't4', userId: '900000001', patch: { categoryId: 'c-pr' } });

    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(keys).toContain(JSON.stringify(transactionKeys.list('900000001')));
    expect(keys).toContain(JSON.stringify(transactionKeys.totals('900000001')));
  });
});

describe('«Отменить» after a delete', () => {
  it('brings the record back on the server and refreshes the lists', async () => {
    vi.mocked(transactionDataSource.restore).mockResolvedValue(undefined);
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await restoreTransaction(client, { id: 't4', userId: '900000001' });

    expect(transactionDataSource.restore).toHaveBeenCalledWith('t4');
    expect(invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey))).toContain(
      JSON.stringify(transactionKeys.list('900000001'))
    );
  });

  it('the deleted record is forgotten, and known again as it was once it is back — nothing reads it (FT-116)', async () => {
    vi.mocked(transactionDataSource.delete).mockResolvedValue(true);
    vi.mocked(transactionDataSource.restore).mockResolvedValue(undefined);
    client.setQueryData(transactionKeys.record('t4'), SAVED);

    await deleteTransaction(client, { id: 't4', userId: '900000001' });
    expect(client.getQueryData(transactionKeys.record('t4'))).toBeUndefined();

    await restoreTransaction(client, { id: 't4', userId: '900000001' });
    expect(client.getQueryData(transactionKeys.record('t4'))).toEqual(SAVED);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('a record nobody had read stays unknown after it is back', async () => {
    vi.mocked(transactionDataSource.delete).mockResolvedValue(true);
    vi.mocked(transactionDataSource.restore).mockResolvedValue(undefined);

    await deleteTransaction(client, { id: 't9', userId: '900000001' });
    await restoreTransaction(client, { id: 't9', userId: '900000001' });

    expect(client.getQueryData(transactionKeys.record('t9'))).toBeUndefined();
  });
});
