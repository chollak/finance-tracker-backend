/**
 * Transaction data source: the records on the server. Guest mode, which kept records in IndexedDB on the device, went
 * away with FT-128 (decision Д4); the shapes keep their old names (`LocalTransaction`) for the screens that read them.
 */

import { useUserStore } from '@/entities/user/model/store';
import { apiClient } from '@/shared/api/client';
import { API_ENDPOINTS } from '@/shared/lib/constants/routes';
import type { LocalTransaction, CreateLocalTransactionDTO, UpdateLocalTransactionDTO } from './schema';

/**
 * Transaction Data Source (server API)
 */
export const transactionDataSource = {
  /**
   * Get all transactions for current user
   */
  async getAll(): Promise<LocalTransaction[]> {
    const { userId } = useUserStore.getState();
    if (!userId) return [];

    const response = await apiClient.get<any[]>(`/transactions/user/${userId}`);
    return (response.data || []).map(serverTxToLocal);
  },

  /**
   * Create a new transaction
   */
  async create(dto: CreateLocalTransactionDTO): Promise<LocalTransaction> {

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
    const { userId } = useUserStore.getState();

    // Pass userId in query for auth middleware to verify ownership
    await apiClient.delete(`/transactions/${id}?userId=${userId}`);
    return true;
  },

  /**
   * Bring a deleted record back (the «Отменить» of «Удалено»): `POST /transactions/:id/restore` on the server
   * (FT-105). Throws when there is nothing to bring back, so the toast says the undo failed.
   */
  async restore(id: string): Promise<void> {

    await apiClient.post(API_ENDPOINTS.TRANSACTIONS.RESTORE(id));
  },

  /**
   * Get a single transaction by ID
   */
  async getById(id: string): Promise<LocalTransaction | undefined> {

    const response = await apiClient.get<any>(`/transactions/${id}`);
    return response.data ? serverTxToLocal(response.data) : undefined;
  },

  /**
   * Get analytics summary
   */
  async getAnalytics(startDate?: string, endDate?: string) {
    const { userId } = useUserStore.getState();
    if (!userId) return null;

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
