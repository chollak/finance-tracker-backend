/**
 * Data Source Manager
 *
 * Architecture:
 * - Guest mode: IndexedDB only (offline-first)
 * - Telegram mode: Server API only (no local caching)
 */

import { useUserStore } from '@/entities/user/model/store';
import { localTransactionRepo } from './transactionRepo';
import { apiClient } from '@/shared/api/client';
import { API_ENDPOINTS } from '@/shared/lib/constants/routes';
import type { LocalTransaction, CreateLocalTransactionDTO, UpdateLocalTransactionDTO } from './schema';

export type DataSourceMode = 'local' | 'server';

/**
 * A guest's records deleted in this session, for «Отменить» (FT-115). The server deletes softly and restores
 * by id (FT-105); the device deletes for good, so the record is kept here to be put back as it was.
 */
const deletedOnDevice = new Map<string, LocalTransaction>();

/**
 * Get current data source mode based on user type
 */
export function getDataSourceMode(): DataSourceMode {
  const { userType } = useUserStore.getState();
  return userType === 'guest' ? 'local' : 'server';
}

/**
 * Transaction Data Source
 * Guest = IndexedDB, Telegram = Server API
 */
export const transactionDataSource = {
  /**
   * Get all transactions for current user
   */
  async getAll(): Promise<LocalTransaction[]> {
    const { userId, userType } = useUserStore.getState();
    if (!userId) return [];

    if (userType === 'guest') {
      return localTransactionRepo.getByUserId(userId);
    }

    // Telegram users: server only
    const response = await apiClient.get<any[]>(`/transactions/user/${userId}`);
    return (response.data || []).map(serverTxToLocal);
  },

  /**
   * Create a new transaction
   */
  async create(dto: CreateLocalTransactionDTO): Promise<LocalTransaction> {
    const { userType } = useUserStore.getState();

    if (userType === 'guest') {
      return localTransactionRepo.create(dto);
    }

    // Telegram users: server only
    const response = await apiClient.post<any>('/transactions', {
      ...dto,
      userId: dto.userId,
    });

    if (!response.data) {
      throw new Error('Failed to create transaction on server');
    }

    // The server resolved the category: take its name and id from the stored record
    return serverTxToLocal({ ...dto, ...response.data.transaction, id: response.data.id, createdAt: new Date().toISOString() });
  },

  /**
   * Update a transaction
   */
  async update(
    id: string,
    updates: UpdateLocalTransactionDTO
  ): Promise<LocalTransaction | undefined> {
    const { userType } = useUserStore.getState();

    if (userType === 'guest') {
      return localTransactionRepo.update(id, updates);
    }

    // Telegram users: server only
    const response = await apiClient.put<any>(`/transactions/${id}`, updates);

    if (!response.data) {
      throw new Error('Failed to update transaction on server');
    }

    return serverTxToLocal(response.data);
  },

  /**
   * Delete a transaction
   */
  async delete(id: string): Promise<boolean> {
    const { userId, userType } = useUserStore.getState();

    if (userType === 'guest') {
      const existing = await localTransactionRepo.getById(id);
      if (existing) deletedOnDevice.set(id, existing);
      return localTransactionRepo.delete(id);
    }

    // Telegram users: server only
    // Pass userId in query for auth middleware to verify ownership
    await apiClient.delete(`/transactions/${id}?userId=${userId}`);
    return true;
  },

  /**
   * Bring a deleted record back (the «Отменить» of «Удалено»): `POST /transactions/:id/restore` on the server
   * (FT-105); a guest's record is put back on the device as it was deleted. Throws when there is nothing to
   * bring back, so the toast says the undo failed.
   */
  async restore(id: string): Promise<void> {
    const { userType } = useUserStore.getState();

    if (userType === 'guest') {
      const deleted = deletedOnDevice.get(id);
      if (!deleted) throw new Error(`Record ${id} was not deleted on this device`);
      await localTransactionRepo.put(deleted);
      deletedOnDevice.delete(id);
      return;
    }

    await apiClient.post(API_ENDPOINTS.TRANSACTIONS.RESTORE(id));
  },

  /**
   * Get a single transaction by ID
   */
  async getById(id: string): Promise<LocalTransaction | undefined> {
    const { userType } = useUserStore.getState();

    if (userType === 'guest') {
      return localTransactionRepo.getById(id);
    }

    // Telegram users: server only
    const response = await apiClient.get<any>(`/transactions/${id}`);
    return response.data ? serverTxToLocal(response.data) : undefined;
  },

  /**
   * Get analytics summary
   */
  async getAnalytics(startDate?: string, endDate?: string) {
    const { userId, userType } = useUserStore.getState();
    if (!userId) return null;

    if (userType === 'guest') {
      return localTransactionRepo.getAnalyticsSummary(userId, startDate, endDate);
    }

    // Telegram users: server only
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    const response = await apiClient.get(`/transactions/analytics/summary/${userId}?${params}`);
    return response.data;
  },
};

/**
 * Convert server transaction to LocalTransaction format
 * (Keeps same interface for compatibility)
 */
function serverTxToLocal(serverTx: any): LocalTransaction {
  return {
    id: serverTx.id,
    date: serverTx.date,
    category: serverTx.category,
    categoryId: serverTx.categoryId,
    categoryColor: serverTx.categoryColor,
    description: serverTx.description,
    amount: Number(serverTx.amount),
    type: serverTx.type,
    semanticType: serverTx.semanticType,
    needsReview: serverTx.needsReview ?? false,
    userId: serverTx.userId,
    merchant: serverTx.merchant,
    localCreatedAt: new Date(serverTx.createdAt || Date.now()).getTime(),
    localUpdatedAt: new Date(serverTx.updatedAt || Date.now()).getTime(),
    isArchived: serverTx.isArchived || false,
  };
}

export default transactionDataSource;
