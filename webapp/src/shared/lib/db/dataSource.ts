/**
 * Data Source Manager
 * Switches between local-only (guest) and hybrid (authenticated) modes
 */

import { useUserStore } from '@/entities/user/model/store';
import { localTransactionRepo } from './transactionRepo';
import { apiClient } from '@/shared/api/client';
import type { LocalTransaction, CreateLocalTransactionDTO, UpdateLocalTransactionDTO } from './schema';

export type DataSourceMode = 'local' | 'hybrid';

/**
 * Get current data source mode based on user type
 */
export function getDataSourceMode(): DataSourceMode {
  const { userType } = useUserStore.getState();
  return userType === 'guest' ? 'local' : 'hybrid';
}

/**
 * Transaction Data Source
 * Abstracts data access between local IndexedDB and server API
 */
export const transactionDataSource = {
  /**
   * Get all transactions for current user
   */
  async getAll(): Promise<LocalTransaction[]> {
    const { userId, userType } = useUserStore.getState();
    if (!userId) return [];

    const mode = userType === 'guest' ? 'local' : 'hybrid';

    if (mode === 'local') {
      // Guest mode: only IndexedDB
      return localTransactionRepo.getByUserId(userId);
    }

    // Hybrid mode: try API first, fallback to IndexedDB
    try {
      const response = await apiClient.get<any[]>(`/transactions/user/${userId}`);
      if (response.data) {
        // TODO: In Phase 5, cache server data to IndexedDB
        // For now, return server data converted to LocalTransaction format
        return response.data.map(serverTxToLocal);
      }
    } catch (error) {
      console.warn('[DataSource] API failed, falling back to IndexedDB:', error);
    }

    // Fallback to IndexedDB (offline mode)
    return localTransactionRepo.getByUserId(userId);
  },

  /**
   * Create a new transaction
   */
  async create(dto: CreateLocalTransactionDTO): Promise<LocalTransaction> {
    const { userType } = useUserStore.getState();
    const mode = userType === 'guest' ? 'local' : 'hybrid';

    // Always create locally first
    const localTx = await localTransactionRepo.create(dto);

    if (mode === 'hybrid') {
      // Try to sync to server immediately
      try {
        const response = await apiClient.post<{ id: string }>('/transactions', {
          ...dto,
          userId: dto.userId,
        });

        if (response.data?.id) {
          await localTransactionRepo.markSynced(localTx.id, response.data.id);
          localTx.serverId = response.data.id;
          localTx.syncStatus = 'synced';
        }
      } catch (error) {
        console.warn('[DataSource] Failed to sync to server:', error);
        // Transaction remains in local state, will sync later
      }
    }

    // Update pending count
    useUserStore.getState().updatePendingCount();

    return localTx;
  },

  /**
   * Update a transaction
   */
  async update(id: string, updates: UpdateLocalTransactionDTO): Promise<LocalTransaction | undefined> {
    const { userType } = useUserStore.getState();
    const mode = userType === 'guest' ? 'local' : 'hybrid';

    // Get existing transaction
    const existing = await localTransactionRepo.getById(id);
    if (!existing) return undefined;

    // Update locally
    const updated = await localTransactionRepo.update(id, updates);
    if (!updated) return undefined;

    if (mode === 'hybrid' && existing.serverId) {
      // Try to sync to server
      try {
        await apiClient.put(`/transactions/${existing.serverId}`, updates);
        await localTransactionRepo.update(id, { syncStatus: 'synced' });
        updated.syncStatus = 'synced';
      } catch (error) {
        console.warn('[DataSource] Failed to sync update to server:', error);
        // Transaction marked as pending_upload, will sync later
      }
    }

    useUserStore.getState().updatePendingCount();
    return updated;
  },

  /**
   * Delete a transaction
   */
  async delete(id: string): Promise<boolean> {
    const { userType } = useUserStore.getState();
    const mode = userType === 'guest' ? 'local' : 'hybrid';

    const existing = await localTransactionRepo.getById(id);
    if (!existing) return false;

    if (mode === 'hybrid' && existing.serverId) {
      // Try to delete from server first
      try {
        await apiClient.delete(`/transactions/${existing.serverId}`);
        // Success - hard delete locally
        await localTransactionRepo.hardDelete(id);
      } catch (error) {
        console.warn('[DataSource] Failed to delete from server:', error);
        // Mark for deletion, will sync later
        await localTransactionRepo.delete(id);
      }
    } else {
      // Local only - just delete
      await localTransactionRepo.delete(id);
    }

    useUserStore.getState().updatePendingCount();
    return true;
  },

  /**
   * Get analytics summary
   */
  async getAnalytics(startDate?: string, endDate?: string) {
    const { userId, userType } = useUserStore.getState();
    if (!userId) return null;

    const mode = userType === 'guest' ? 'local' : 'hybrid';

    if (mode === 'local') {
      return localTransactionRepo.getAnalyticsSummary(userId, startDate, endDate);
    }

    // Hybrid mode: prefer server
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const response = await apiClient.get(`/transactions/analytics/summary/${userId}?${params}`);
      return response.data;
    } catch (error) {
      console.warn('[DataSource] Analytics API failed, using local:', error);
      return localTransactionRepo.getAnalyticsSummary(userId, startDate, endDate);
    }
  },
};

/**
 * Convert server transaction to LocalTransaction format
 */
function serverTxToLocal(serverTx: any): LocalTransaction {
  return {
    id: serverTx.id,
    serverId: serverTx.id,
    date: serverTx.date,
    category: serverTx.category,
    description: serverTx.description,
    amount: Number(serverTx.amount),
    type: serverTx.type,
    userId: serverTx.userId,
    merchant: serverTx.merchant,
    syncStatus: 'synced',
    localCreatedAt: new Date(serverTx.createdAt || Date.now()).getTime(),
    localUpdatedAt: new Date(serverTx.updatedAt || Date.now()).getTime(),
    serverUpdatedAt: serverTx.updatedAt,
    isArchived: serverTx.isArchived || false,
  };
}

export default transactionDataSource;
