/**
 * IndexedDB Schema Types
 * Defines local storage structure for offline-first functionality
 */

export type SyncStatus = 'local' | 'synced' | 'pending_upload' | 'pending_delete';

/**
 * Local transaction stored in IndexedDB
 * Extended with sync metadata for offline/online synchronization
 */
export interface LocalTransaction {
  id: string;                    // Local UUID
  serverId?: string;             // Server ID (populated after sync)

  // Core transaction data
  date: string;
  category: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  userId: string;                // guest_UUID or Telegram ID
  merchant?: string;

  // Sync metadata
  syncStatus: SyncStatus;
  localCreatedAt: number;        // Unix timestamp
  localUpdatedAt: number;        // Unix timestamp
  serverUpdatedAt?: string;      // ISO string from server

  // Archive support
  isArchived?: boolean;
}

/**
 * Local user stored in IndexedDB
 */
export interface LocalUser {
  id: string;                    // guest_UUID or Telegram ID
  type: 'guest' | 'telegram';
  telegramId?: string;
  userName?: string;
  createdAt: number;
  lastSyncAt?: number;
}

/**
 * Sync metadata for tracking synchronization state
 */
export interface SyncMeta {
  key: string;                   // 'lastSync'
  lastSyncTimestamp: number;
  pendingChanges: number;
}

/**
 * DTO for creating a new local transaction
 */
export interface CreateLocalTransactionDTO {
  date: string;
  category: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  userId: string;
  merchant?: string;
}

/**
 * DTO for updating a local transaction
 */
export interface UpdateLocalTransactionDTO {
  date?: string;
  category?: string;
  description?: string;
  amount?: number;
  type?: 'income' | 'expense';
  merchant?: string;
}
