import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserStore } from '@/entities/user/model/store';
import { apiClient } from '@/shared/api/client';
import { transactionDataSource } from './dataSource';
import { localTransactionRepo } from './transactionRepo';
import type { LocalTransaction } from './schema';

/**
 * FT-115: «Отменить» after «Удалить операцию» brings the record back. On the server a delete is soft (FT-105)
 * and `POST /:id/restore` returns it; a guest's record lives on the device, so the data source keeps the
 * deleted record for the undo and puts it back as it was.
 */

vi.mock('@/shared/api/client', () => ({ apiClient: { post: vi.fn(), delete: vi.fn(), get: vi.fn(), put: vi.fn() } }));
vi.mock('./transactionRepo', () => ({
  localTransactionRepo: { getById: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

const GUEST = 'guest_7a1c';

const LOCAL: LocalTransaction = {
  id: 't4', date: '2026-10-13', category: 'Кафе', categoryId: 'guest:cafe', description: 'Обед с командой', amount: 145000,
  type: 'expense', userId: GUEST, localCreatedAt: 1, localUpdatedAt: 2,
};

beforeEach(() => {
  vi.mocked(apiClient.post).mockReset();
  vi.mocked(localTransactionRepo.getById).mockReset();
  vi.mocked(localTransactionRepo.delete).mockReset();
  vi.mocked(localTransactionRepo.put).mockReset();
});

describe('restoring a deleted record', () => {
  it('a signed-in user: POST /transactions/:id/restore', async () => {
    useUserStore.setState({ userId: '900000001', userType: 'telegram' });

    await transactionDataSource.restore('t4');

    expect(apiClient.post).toHaveBeenCalledWith('/transactions/t4/restore');
  });

  it('a guest: the record deleted from the device is put back as it was', async () => {
    useUserStore.setState({ userId: GUEST, userType: 'guest' });
    vi.mocked(localTransactionRepo.getById).mockResolvedValue(LOCAL);
    vi.mocked(localTransactionRepo.delete).mockResolvedValue(true);

    await transactionDataSource.delete('t4');
    await transactionDataSource.restore('t4');

    expect(localTransactionRepo.put).toHaveBeenCalledWith(LOCAL);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('a guest record that was not deleted here cannot be brought back: the undo says it failed', async () => {
    useUserStore.setState({ userId: GUEST, userType: 'guest' });

    await expect(transactionDataSource.restore('t9')).rejects.toThrow();
  });
});
