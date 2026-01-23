/**
 * IndexedDB Schema Types
 * Defines local storage structure for guest mode (offline-first)
 */

/**
 * Local transaction stored in IndexedDB
 * Used for guest users only
 */
export interface LocalTransaction {
  id: string; // Local UUID

  // Core transaction data
  date: string;
  category: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  userId: string; // guest_UUID
  merchant?: string;

  // Timestamps
  localCreatedAt: number; // Unix timestamp
  localUpdatedAt: number; // Unix timestamp

  // Archive support
  isArchived?: boolean;
}

/**
 * Local user stored in IndexedDB
 */
export interface LocalUser {
  id: string; // guest_UUID or Telegram ID
  type: 'guest' | 'telegram';
  telegramId?: string;
  userName?: string;
  createdAt: number;
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
  isArchived?: boolean;
}
