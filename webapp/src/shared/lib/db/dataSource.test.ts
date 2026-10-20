import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserStore } from '@/entities/user/model/store';
import { apiClient } from '@/shared/api/client';
import { transactionDataSource } from './dataSource';

/**
 * FT-115: «Отменить» after «Удалить операцию» brings the record back. On the server a delete is soft (FT-105) and
 * `POST /:id/restore` returns it. Records live only on the server since guest mode went away (FT-128).
 */

vi.mock('@/shared/api/client', () => ({ apiClient: { post: vi.fn(), delete: vi.fn(), get: vi.fn(), put: vi.fn() } }));

beforeEach(() => {
  vi.mocked(apiClient.post).mockReset();
  vi.mocked(apiClient.delete).mockReset();
});

describe('deleting and restoring a record', () => {
  it('deletes on the server and brings it back with POST /transactions/:id/restore', async () => {
    useUserStore.setState({ userId: '900000001', userType: 'telegram' });

    await transactionDataSource.delete('t4');
    await transactionDataSource.restore('t4');

    expect(apiClient.delete).toHaveBeenCalledWith('/transactions/t4?userId=900000001');
    expect(apiClient.post).toHaveBeenCalledWith('/transactions/t4/restore');
  });

  it('a restore the server refuses fails, so the undo says so', async () => {
    useUserStore.setState({ userId: '900000001', userType: 'telegram' });
    vi.mocked(apiClient.post).mockRejectedValue({ statusCode: 404 });

    await expect(transactionDataSource.restore('t9')).rejects.toEqual({ statusCode: 404 });
  });
});
