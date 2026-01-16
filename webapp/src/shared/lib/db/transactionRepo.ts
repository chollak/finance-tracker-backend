/**
 * Local Transaction Repository
 * CRUD operations for transactions stored in IndexedDB
 */

import { db } from './indexedDB';
import type {
  LocalTransaction,
  CreateLocalTransactionDTO,
  UpdateLocalTransactionDTO,
  SyncStatus,
} from './schema';

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Local Transaction Repository
 * Provides offline-first CRUD operations
 */
export const localTransactionRepo = {
  /**
   * Create a new local transaction
   */
  async create(dto: CreateLocalTransactionDTO): Promise<LocalTransaction> {
    const now = Date.now();
    const transaction: LocalTransaction = {
      id: generateUUID(),
      ...dto,
      syncStatus: 'local',
      localCreatedAt: now,
      localUpdatedAt: now,
      isArchived: false,
    };

    await db.transactions.add(transaction);
    console.log('[LocalRepo] Transaction created:', transaction.id);
    return transaction;
  },

  /**
   * Get all transactions for a user (non-archived)
   */
  async getByUserId(userId: string): Promise<LocalTransaction[]> {
    return db.transactions
      .where('[userId+isArchived]')
      .equals([userId, 0]) // 0 = false in IndexedDB
      .or('[userId+isArchived]')
      .equals([userId, false])
      .reverse()
      .sortBy('date');
  },

  /**
   * Get all transactions for a user (including archived)
   */
  async getAllByUserId(userId: string): Promise<LocalTransaction[]> {
    return db.transactions
      .where('userId')
      .equals(userId)
      .reverse()
      .sortBy('date');
  },

  /**
   * Get a transaction by ID
   */
  async getById(id: string): Promise<LocalTransaction | undefined> {
    return db.transactions.get(id);
  },

  /**
   * Get a transaction by server ID
   */
  async getByServerId(serverId: string): Promise<LocalTransaction | undefined> {
    return db.transactions.where('serverId').equals(serverId).first();
  },

  /**
   * Update a transaction
   */
  async update(
    id: string,
    updates: UpdateLocalTransactionDTO
  ): Promise<LocalTransaction | undefined> {
    const existing = await db.transactions.get(id);
    if (!existing) {
      console.warn('[LocalRepo] Transaction not found:', id);
      return undefined;
    }

    const updatedTransaction: LocalTransaction = {
      ...existing,
      ...updates,
      localUpdatedAt: Date.now(),
      // Mark for sync if it was previously synced
      syncStatus:
        existing.syncStatus === 'synced' ? 'pending_upload' : existing.syncStatus,
    };

    await db.transactions.put(updatedTransaction);
    console.log('[LocalRepo] Transaction updated:', id);
    return updatedTransaction;
  },

  /**
   * Delete a transaction (soft delete - mark for deletion)
   */
  async delete(id: string): Promise<boolean> {
    const existing = await db.transactions.get(id);
    if (!existing) {
      return false;
    }

    if (existing.syncStatus === 'local') {
      // Never synced - just delete locally
      await db.transactions.delete(id);
      console.log('[LocalRepo] Transaction deleted (local):', id);
    } else {
      // Was synced - mark for deletion on next sync
      await db.transactions.update(id, {
        syncStatus: 'pending_delete' as SyncStatus,
        localUpdatedAt: Date.now(),
      });
      console.log('[LocalRepo] Transaction marked for deletion:', id);
    }
    return true;
  },

  /**
   * Hard delete a transaction (used after successful server deletion)
   */
  async hardDelete(id: string): Promise<void> {
    await db.transactions.delete(id);
  },

  /**
   * Archive a transaction
   */
  async archive(id: string): Promise<boolean> {
    const count = await db.transactions.update(id, {
      isArchived: true,
      localUpdatedAt: Date.now(),
    });
    return count > 0;
  },

  /**
   * Get pending uploads (local or pending_upload status)
   */
  async getPendingUploads(userId: string): Promise<LocalTransaction[]> {
    return db.transactions
      .where('[userId+syncStatus]')
      .anyOf([
        [userId, 'local'],
        [userId, 'pending_upload'],
      ])
      .toArray();
  },

  /**
   * Get pending deletions
   */
  async getPendingDeletions(userId: string): Promise<LocalTransaction[]> {
    return db.transactions
      .where('[userId+syncStatus]')
      .equals([userId, 'pending_delete'])
      .toArray();
  },

  /**
   * Mark transaction as synced
   */
  async markSynced(localId: string, serverId: string): Promise<void> {
    await db.transactions.update(localId, {
      serverId,
      syncStatus: 'synced' as SyncStatus,
      serverUpdatedAt: new Date().toISOString(),
    });
    console.log('[LocalRepo] Transaction marked as synced:', localId, '->', serverId);
  },

  /**
   * Bulk insert transactions (for sync download)
   */
  async bulkInsert(transactions: LocalTransaction[]): Promise<void> {
    await db.transactions.bulkPut(transactions);
    console.log('[LocalRepo] Bulk inserted:', transactions.length, 'transactions');
  },

  /**
   * Get transaction count by user
   */
  async getCount(userId: string): Promise<number> {
    return db.transactions.where('userId').equals(userId).count();
  },

  /**
   * Get pending changes count
   */
  async getPendingCount(userId: string): Promise<number> {
    return db.transactions
      .where('userId')
      .equals(userId)
      .and(
        (tx) =>
          tx.syncStatus === 'local' ||
          tx.syncStatus === 'pending_upload' ||
          tx.syncStatus === 'pending_delete'
      )
      .count();
  },

  /**
   * Update user ID for all transactions (used when linking guest to Telegram)
   */
  async updateUserId(oldUserId: string, newUserId: string): Promise<number> {
    const transactions = await db.transactions.where('userId').equals(oldUserId).toArray();

    const updated = transactions.map((tx) => ({
      ...tx,
      userId: newUserId,
      syncStatus: 'pending_upload' as SyncStatus,
      localUpdatedAt: Date.now(),
    }));

    await db.transactions.bulkPut(updated);
    console.log('[LocalRepo] Updated userId for', updated.length, 'transactions');
    return updated.length;
  },

  /**
   * Get transactions in date range
   */
  async getByDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<LocalTransaction[]> {
    return db.transactions
      .where('userId')
      .equals(userId)
      .and((tx) => tx.date >= startDate && tx.date <= endDate && !tx.isArchived)
      .toArray();
  },

  /**
   * Calculate analytics summary locally
   */
  async getAnalyticsSummary(
    userId: string,
    startDate?: string,
    endDate?: string
  ): Promise<{
    totalIncome: number;
    totalExpense: number;
    balance: number;
    transactionCount: number;
  }> {
    let query = db.transactions.where('userId').equals(userId);

    const transactions = await query
      .and((tx) => {
        if (tx.isArchived) return false;
        if (startDate && tx.date < startDate) return false;
        if (endDate && tx.date > endDate) return false;
        return true;
      })
      .toArray();

    const totalIncome = transactions
      .filter((tx) => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalExpense = transactions
      .filter((tx) => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);

    return {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      transactionCount: transactions.length,
    };
  },

  /**
   * Get spending by category
   */
  async getByCategory(
    userId: string,
    startDate?: string,
    endDate?: string
  ): Promise<Record<string, number>> {
    const transactions = await db.transactions
      .where('userId')
      .equals(userId)
      .and((tx) => {
        if (tx.isArchived) return false;
        if (tx.type !== 'expense') return false;
        if (startDate && tx.date < startDate) return false;
        if (endDate && tx.date > endDate) return false;
        return true;
      })
      .toArray();

    return transactions.reduce(
      (acc, tx) => {
        acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
        return acc;
      },
      {} as Record<string, number>
    );
  },
};

export default localTransactionRepo;
