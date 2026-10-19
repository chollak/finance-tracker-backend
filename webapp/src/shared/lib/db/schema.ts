/**
 * IndexedDB Schema Types
 * Defines local storage structure for guest mode (offline-first)
 */

import type { TransactionSemanticType } from '@/shared/types';

/**
 * Local transaction stored in IndexedDB
 * Used for guest users only
 */
export interface LocalTransaction {
  id: string; // Local UUID

  // Core transaction data
  date: string;
  category: string;
  /** Server records only (FT-099): the user's category and its colour. */
  categoryId?: string;
  categoryColor?: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  semanticType?: TransactionSemanticType;
  needsReview?: boolean;
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
  categoryId?: string;
  description: string;
  amount: number;
  /** For the server (FT-113); guest records keep using `amount`, and guests have no accounts. */
  amountMinor?: number;
  currency?: 'UZS' | 'USD';
  accountId?: string;
  clientId?: string;
  type: 'income' | 'expense';
  semanticType?: TransactionSemanticType;
  needsReview?: boolean;
  userId: string;
  merchant?: string;
}

/**
 * DTO for updating a local transaction
 */
export interface UpdateLocalTransactionDTO {
  date?: string;
  category?: string;
  categoryId?: string;
  description?: string;
  amount?: number;
  type?: 'income' | 'expense';
  semanticType?: TransactionSemanticType;
  needsReview?: boolean;
  merchant?: string;
  isArchived?: boolean;
}
