import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/shared/api/client';
import type { CreateTransactionDTO } from '@/shared/types';
import { createRecord, deleteRecord, RECORD_WRITE_TIMEOUT_MS, restoreRecord } from './serverRecords';

/**
 * The record writes that go to the server as they are (#289: moved here from `shared/lib/db/dataSource.ts`, which kept
 * the shapes of guest mode). Manual entry and the quick chips write a record (FT-113, FT-114); «Удалить операцию» deletes
 * it softly (FT-105) and «Отменить» brings it back with `POST /:id/restore` (FT-115).
 */

vi.mock('@/shared/api/client', () => ({ apiClient: { post: vi.fn(), delete: vi.fn(), get: vi.fn(), put: vi.fn() } }));

const ENTRY: CreateTransactionDTO = {
  type: 'expense',
  amount: 18000,
  amountMinor: 1_800_000,
  currency: 'UZS',
  accountId: 'card',
  categoryId: 'c-tr',
  category: 'Транспорт',
  date: '2026-11-16',
  description: 'Такси',
  userId: '900000001',
  userName: 'Test',
  clientId: 'client-1',
};

beforeEach(() => {
  vi.mocked(apiClient.post).mockReset();
  vi.mocked(apiClient.delete).mockReset();
});

describe('writing a record', () => {
  it('is one POST /transactions of the record with its client id, given up after the write timeout (FT-129)', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'srv-1', transaction: { category: 'Транспорт' } } });

    await createRecord(ENTRY);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/transactions',
      {
        date: '2026-11-16',
        category: 'Транспорт',
        categoryId: 'c-tr',
        description: 'Такси',
        amount: 18000,
        type: 'expense',
        semanticType: undefined,
        needsReview: undefined,
        userId: '900000001',
        merchant: undefined,
        amountMinor: 1_800_000,
        currency: 'UZS',
        accountId: 'card',
        clientId: 'client-1',
      },
      { timeoutMs: RECORD_WRITE_TIMEOUT_MS }
    );
    expect(RECORD_WRITE_TIMEOUT_MS).toBe(15_000);
  });

  it('gives the record the server stored: its id and the category it resolved', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { id: 'srv-1', transaction: { category: 'Такси и транспорт', categoryId: 'c-tr', categoryColor: 'sky', amount: '18000' } },
    });

    const saved = await createRecord(ENTRY);

    expect(saved).toMatchObject({
      id: 'srv-1',
      category: 'Такси и транспорт',
      categoryId: 'c-tr',
      categoryColor: 'sky',
      amount: 18000,
      type: 'expense',
      description: 'Такси',
      needsReview: false,
      isArchived: false,
      userId: '900000001',
    });
  });

  it('an answer without a body is a failed write', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: undefined });

    await expect(createRecord(ENTRY)).rejects.toThrow('Failed to create transaction on server');
  });
});

describe('deleting and restoring a record', () => {
  it('deletes on the server and brings it back with POST /transactions/:id/restore', async () => {
    await deleteRecord('t4');
    await restoreRecord('t4');

    // The server takes the user from authentication; a `?userId=` was never read (#289)
    expect(apiClient.delete).toHaveBeenCalledWith('/transactions/t4');
    expect(apiClient.post).toHaveBeenCalledWith('/transactions/t4/restore');
  });

  it('a restore the server refuses fails, so the undo says so', async () => {
    vi.mocked(apiClient.post).mockRejectedValue({ statusCode: 404 });

    await expect(restoreRecord('t9')).rejects.toEqual({ statusCode: 404 });
  });
});
