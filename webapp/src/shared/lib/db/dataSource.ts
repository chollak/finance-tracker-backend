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
import type { LocalTransaction, CreateLocalTransactionDTO, UpdateLocalTransactionDTO } from './schema';

export type DataSourceMode = 'local' | 'server';

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

    // Return server response with id
    return serverTxToLocal({ ...dto, id: response.data.id, createdAt: new Date().toISOString() });
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
      return localTransactionRepo.delete(id);
    }

    // Telegram users: server only
    // Pass userId in query for auth middleware to verify ownership
    await apiClient.delete(`/transactions/${id}?userId=${userId}`);
    return true;
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
    description: serverTx.description,
    amount: Number(serverTx.amount),
    type: serverTx.type,
    userId: serverTx.userId,
    merchant: serverTx.merchant,
    localCreatedAt: new Date(serverTx.createdAt || Date.now()).getTime(),
    localUpdatedAt: new Date(serverTx.updatedAt || Date.now()).getTime(),
    isArchived: serverTx.isArchived || false,
  };
}

export default transactionDataSource;
