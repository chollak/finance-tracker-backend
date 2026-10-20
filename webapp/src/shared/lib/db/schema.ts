/**
 * Record shapes the data source gives the older screens (the names date from guest mode, which kept records in
 * IndexedDB; it went away with FT-128).
 */

import type { TransactionSemanticType } from '@/shared/types';

/**
 * A record as the data source gives it
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
  userId: string;
  merchant?: string;

  // Timestamps
  localCreatedAt: number; // Unix timestamp
  localUpdatedAt: number; // Unix timestamp

  // Archive support
  isArchived?: boolean;
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
  /** For the server (FT-113): the amount in minor units, its currency and account. */
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
