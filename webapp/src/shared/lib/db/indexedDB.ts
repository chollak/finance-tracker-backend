/**
 * IndexedDB Database using Dexie.js
 * Provides offline-first storage for Finance Tracker
 */

import Dexie, { type EntityTable } from 'dexie';
import type { LocalTransaction, LocalUser, SyncMeta } from './schema';

/**
 * Finance Tracker IndexedDB Database
 */
class FinanceTrackerDB extends Dexie {
  transactions!: EntityTable<LocalTransaction, 'id'>;
  users!: EntityTable<LocalUser, 'id'>;
  syncMeta!: EntityTable<SyncMeta, 'key'>;

  constructor() {
    super('FinanceTrackerDB');

    this.version(1).stores({
      // Transactions table with indexes
      transactions: [
        'id',
        'serverId',
        'userId',
        'date',
        'category',
        'type',
        'syncStatus',
        'localCreatedAt',
        'localUpdatedAt',
        '[userId+date]',
        '[userId+syncStatus]',
        '[userId+isArchived]',
      ].join(', '),

      // Users table
      users: 'id, type, telegramId',

      // Sync metadata
      syncMeta: 'key',
    });
  }
}

/**
 * Singleton database instance
 */
export const db = new FinanceTrackerDB();

/**
 * Initialize database (call on app startup)
 */
export async function initDatabase(): Promise<void> {
  try {
    await db.open();
    console.log('[IndexedDB] Database initialized successfully');
  } catch (error) {
    console.error('[IndexedDB] Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Clear all data from the database
 */
export async function clearDatabase(): Promise<void> {
  await db.transactions.clear();
  await db.users.clear();
  await db.syncMeta.clear();
  console.log('[IndexedDB] Database cleared');
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<{
  transactionsCount: number;
  usersCount: number;
  pendingUploads: number;
}> {
  const [transactionsCount, usersCount, pendingUploads] = await Promise.all([
    db.transactions.count(),
    db.users.count(),
    db.transactions.where('syncStatus').equals('pending_upload').count(),
  ]);

  return { transactionsCount, usersCount, pendingUploads };
}

export default db;
