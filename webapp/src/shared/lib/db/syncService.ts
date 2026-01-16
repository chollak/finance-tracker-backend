/**
 * Sync Service
 * Handles synchronization between local IndexedDB and server API
 */

import { db } from './indexedDB';
import { localTransactionRepo } from './transactionRepo';
import { apiClient } from '@/shared/api/client';
import { useUserStore } from '@/entities/user/model/store';
import type { LocalTransaction, SyncStatus } from './schema';

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  deleted: number;
  conflicts: number;
  errors: string[];
  success: boolean;
}

/**
 * Sync Service for manual synchronization
 */
export const syncService = {
  /**
   * Perform full synchronization
   */
  async sync(): Promise<SyncResult> {
    const result: SyncResult = {
      uploaded: 0,
      downloaded: 0,
      deleted: 0,
      conflicts: 0,
      errors: [],
      success: false,
    };

    const { userId, userType, telegramId } = useUserStore.getState();

    if (!userId || userType !== 'telegram') {
      result.errors.push('User not authenticated with Telegram');
      return result;
    }

    const effectiveUserId = telegramId || userId;

    try {
      // 1. Upload pending transactions
      await this.uploadPending(effectiveUserId, result);

      // 2. Process pending deletions
      await this.processDeletions(effectiveUserId, result);

      // 3. Download server changes
      await this.downloadFromServer(effectiveUserId, result);

      // 4. Update sync metadata
      await db.syncMeta.put({
        key: 'lastSync',
        lastSyncTimestamp: Date.now(),
        pendingChanges: 0,
      });

      useUserStore.getState().setLastSyncAt(Date.now());
      await useUserStore.getState().updatePendingCount();

      result.success = result.errors.length === 0;
    } catch (error) {
      result.errors.push(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  },

  /**
   * Upload pending local transactions to server
   */
  async uploadPending(userId: string, result: SyncResult): Promise<void> {
    const pending = await localTransactionRepo.getPendingUploads(userId);

    for (const tx of pending) {
      try {
        if (tx.syncStatus === 'local') {
          // New transaction - create on server
          const response = await apiClient.post<{ id: string }>('/transactions', {
            date: tx.date,
            category: tx.category,
            description: tx.description,
            amount: tx.amount,
            type: tx.type,
            userId: userId,
            merchant: tx.merchant,
          });

          if (response.data?.id) {
            await localTransactionRepo.markSynced(tx.id, response.data.id);
            result.uploaded++;
          }
        } else if (tx.syncStatus === 'pending_upload' && tx.serverId) {
          // Updated transaction - update on server
          await apiClient.put(`/transactions/${tx.serverId}`, {
            date: tx.date,
            category: tx.category,
            description: tx.description,
            amount: tx.amount,
            type: tx.type,
            merchant: tx.merchant,
          });

          await db.transactions.update(tx.id, {
            syncStatus: 'synced' as SyncStatus,
            serverUpdatedAt: new Date().toISOString(),
          });
          result.uploaded++;
        }
      } catch (error) {
        result.errors.push(`Failed to upload ${tx.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  },

  /**
   * Process pending deletions
   */
  async processDeletions(userId: string, result: SyncResult): Promise<void> {
    const pendingDeletions = await localTransactionRepo.getPendingDeletions(userId);

    for (const tx of pendingDeletions) {
      try {
        if (tx.serverId) {
          await apiClient.delete(`/transactions/${tx.serverId}`);
        }
        await localTransactionRepo.hardDelete(tx.id);
        result.deleted++;
      } catch (error) {
        result.errors.push(`Failed to delete ${tx.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  },

  /**
   * Download transactions from server
   */
  async downloadFromServer(userId: string, result: SyncResult): Promise<void> {
    try {
      const response = await apiClient.get<any[]>(`/transactions/user/${userId}`);

      if (!response.data) {
        return;
      }

      for (const serverTx of response.data) {
        // Check if we already have this transaction
        const existing = await db.transactions
          .where('serverId')
          .equals(serverTx.id)
          .first();

        if (!existing) {
          // New from server - add to local
          const localTx: LocalTransaction = {
            id: crypto.randomUUID(),
            serverId: serverTx.id,
            date: serverTx.date,
            category: serverTx.category,
            description: serverTx.description,
            amount: Number(serverTx.amount),
            type: serverTx.type,
            userId: userId,
            merchant: serverTx.merchant,
            syncStatus: 'synced',
            localCreatedAt: new Date(serverTx.createdAt || Date.now()).getTime(),
            localUpdatedAt: new Date(serverTx.updatedAt || Date.now()).getTime(),
            serverUpdatedAt: serverTx.updatedAt,
            isArchived: serverTx.isArchived || false,
          };

          await db.transactions.add(localTx);
          result.downloaded++;
        } else if (existing.syncStatus === 'synced') {
          // Already synced - check for updates from server
          const serverUpdated = new Date(serverTx.updatedAt || 0).getTime();
          const localUpdated = existing.localUpdatedAt;

          if (serverUpdated > localUpdated) {
            await db.transactions.update(existing.id, {
              date: serverTx.date,
              category: serverTx.category,
              description: serverTx.description,
              amount: Number(serverTx.amount),
              type: serverTx.type,
              merchant: serverTx.merchant,
              serverUpdatedAt: serverTx.updatedAt,
              localUpdatedAt: serverUpdated,
              isArchived: serverTx.isArchived || false,
            });
            result.downloaded++;
          }
        } else {
          // Conflict - local has pending changes
          result.conflicts++;
        }
      }
    } catch (error) {
      result.errors.push(`Failed to download: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Merge guest data with Telegram account
   */
  async mergeGuestData(guestUserId: string, telegramUserId: string): Promise<SyncResult> {
    const result: SyncResult = {
      uploaded: 0,
      downloaded: 0,
      deleted: 0,
      conflicts: 0,
      errors: [],
      success: false,
    };

    try {
      // 1. Get all guest transactions
      const guestTransactions = await localTransactionRepo.getAllByUserId(guestUserId);
      console.log(`[SyncService] Found ${guestTransactions.length} guest transactions to merge`);

      // 2. Update userId and mark for upload
      for (const tx of guestTransactions) {
        await db.transactions.update(tx.id, {
          userId: telegramUserId,
          syncStatus: 'local' as SyncStatus,
          localUpdatedAt: Date.now(),
        });
      }

      // 3. Delete guest user record
      await db.users.delete(guestUserId);

      // 4. Perform sync to upload to server
      const syncResult = await this.sync();

      result.uploaded = syncResult.uploaded;
      result.downloaded = syncResult.downloaded;
      result.errors = syncResult.errors;
      result.success = syncResult.success;

      console.log('[SyncService] Merge completed:', result);
    } catch (error) {
      result.errors.push(`Merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  },

  /**
   * Get last sync timestamp
   */
  async getLastSyncTimestamp(): Promise<number | null> {
    const meta = await db.syncMeta.get('lastSync');
    return meta?.lastSyncTimestamp || null;
  },

  /**
   * Check if there are pending changes
   */
  async hasPendingChanges(): Promise<boolean> {
    const { userId } = useUserStore.getState();
    if (!userId) return false;

    const count = await localTransactionRepo.getPendingCount(userId);
    return count > 0;
  },
};

export default syncService;
