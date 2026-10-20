import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { transactionDataSource } from '@/shared/lib/db';
import type { Transaction } from '@/shared/types';
import { transactionKeys } from './keys';
import { patchTransaction, restoreTransaction } from './mutations';

/**
 * FT-115: the record sheet saves every change at once through `patchTransaction` and brings a deleted record
 * back through `restoreTransaction`. A signed-in user's record is the server's (PUT, POST restore); a guest's
 * lives on the device (guest mode goes with FT-128, until then its records open the same sheet).
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

describe('a change of a guest record (device)', () => {
  const GUEST = 'guest_1f2e';

  it('writes the device record: the amount in сум, no account or currency', async () => {
    vi.mocked(transactionDataSource.update).mockResolvedValue({
      id: 't4', date: '2026-10-14', category: 'Кафе', description: '', amount: 20000, type: 'expense', userId: GUEST,
      localCreatedAt: 0, localUpdatedAt: 0,
    });

    await patchTransaction(client, { id: 't4', userId: GUEST, patch: { amountMinor: 2_000_000 } });
    await patchTransaction(client, { id: 't4', userId: GUEST, patch: { accountId: 'card', currency: 'UZS' } });

    expect(transactionDataSource.update).toHaveBeenNthCalledWith(1, 't4', { amount: 20000 });
    expect(transactionDataSource.update).toHaveBeenNthCalledWith(2, 't4', {});
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('a new category writes its name too, which the old History list shows', async () => {
    vi.mocked(transactionDataSource.update).mockResolvedValue({
      id: 't4', date: '2026-10-14', category: 'Продукты', categoryId: 'guest:groceries', description: '', amount: 20000,
      type: 'expense', userId: GUEST, localCreatedAt: 0, localUpdatedAt: 0,
    });

    await patchTransaction(client, { id: 't4', userId: GUEST, patch: { categoryId: 'guest:groceries' } });
    await patchTransaction(client, {
      id: 't4', userId: GUEST, patch: { type: 'income', categoryId: 'guest:salary', semanticType: 'income' },
    });

    expect(transactionDataSource.update).toHaveBeenNthCalledWith(1, 't4', { categoryId: 'guest:groceries', category: 'Продукты' });
    expect(transactionDataSource.update).toHaveBeenNthCalledWith(2, 't4', {
      categoryId: 'guest:salary', category: 'Зарплата', type: 'income', semanticType: 'income',
    });
  });
});

describe('«Отменить» after a delete', () => {
  it('brings the record back where it lives (the data source: the server or the device) and refreshes the lists', async () => {
    vi.mocked(transactionDataSource.restore).mockResolvedValue(undefined);
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await restoreTransaction(client, { id: 't4', userId: '900000001' });

    expect(transactionDataSource.restore).toHaveBeenCalledWith('t4');
    expect(invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey))).toContain(
      JSON.stringify(transactionKeys.list('900000001'))
    );
  });
});
