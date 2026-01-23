/**
 * IndexedDB Database using Dexie.js
 * Provides offline-first storage for guest users
 */

import Dexie, { type EntityTable } from 'dexie';
import type { LocalTransaction, LocalUser } from './schema';

/**
 * Finance Tracker IndexedDB Database
 */
class FinanceTrackerDB extends Dexie {
  transactions!: EntityTable<LocalTransaction, 'id'>;
  users!: EntityTable<LocalUser, 'id'>;

  constructor() {
    super('FinanceTrackerDB');

    // Version 2: Simplified schema without sync metadata
    this.version(2).stores({
      // Transactions table with indexes
      transactions: [
        'id',
        'userId',
        'date',
        'category',
        'type',
        'localCreatedAt',
        'localUpdatedAt',
        '[userId+date]',
        '[userId+isArchived]',
      ].join(', '),

      // Users table
      users: 'id, type, telegramId',

      // Remove syncMeta table from previous version
      syncMeta: null,
    });

    // Keep version 1 for migration
    this.version(1).stores({
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
      users: 'id, type, telegramId',
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
  console.log('[IndexedDB] Database cleared');
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<{
  transactionsCount: number;
  usersCount: number;
}> {
  const [transactionsCount, usersCount] = await Promise.all([
    db.transactions.count(),
    db.users.count(),
  ]);

  return { transactionsCount, usersCount };
}

export default db;
