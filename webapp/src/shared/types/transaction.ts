// Semantic transaction type — the "meaning" of a movement, distinct from income/expense.
// Mirrors src/modules/transaction/domain/transactionSemanticType.ts on the backend.
export const TRANSACTION_SEMANTIC_TYPES = [
  'expense',
  'income',
  'own_transfer',
  'saving_deposit',
  'debt',
  'reimbursement',
  'cash_withdrawal',
  'group_payment',
] as const;

export type TransactionSemanticType = typeof TRANSACTION_SEMANTIC_TYPES[number];

// Transaction types
export interface Transaction {
  id?: string;
  date: string;
  /** Current name of the record's category (the API returns names since FT-099). */
  category: string;
  /** The user's category (FT-099); missing only for guest-mode records. */
  categoryId?: string;
  /** Pastel colour token of the category (FT-100). */
  categoryColor?: string;
  description: string;
  /** In the record's `currency`, major units: сум, or dollars for a USD record (FT-103). */
  amount: number;
  /** Integer minor units (FT-097) of the record's currency. */
  amountMinor?: number;
  /** UZS unless the record is in dollars (FT-103); older records and guest mode have none — сум. */
  currency?: 'UZS' | 'USD';
  /** The account the money moved on (FT-101). */
  accountId?: string;
  type: 'income' | 'expense';
  semanticType?: TransactionSemanticType;
  needsReview?: boolean;
  userId: string;
  userName?: string;
  // Timestamps
  createdAt?: string; // ISO datetime string for time display
  // Enhanced fields for learning
  merchant?: string;
  confidence?: number;
  originalText?: string;
  originalParsing?: {
    amount: number;
    category: string;
    type: 'income' | 'expense';
    merchant?: string;
    confidence?: number;
  };
  // Archive support
  isArchived?: boolean;
}

// DTO types for API calls
export interface CreateTransactionDTO {
  date: string;
  /** Category name; `categoryId` decides on the server when given. */
  category: string;
  categoryId?: string;
  /** The note; may be empty (FT-113). */
  description: string;
  amount: number;
  /** Integer minor units of `currency` (FT-097); the server prefers it to `amount`. */
  amountMinor?: number;
  /** The account's currency (FT-103); without it the account's, else сум. */
  currency?: 'UZS' | 'USD';
  /** One of the user's visible accounts (FT-101); without it the default account. */
  accountId?: string;
  /** The client's id of the record (FT-106): a repeat returns the same record instead of a second one. */
  clientId?: string;
  type: 'income' | 'expense';
  semanticType?: TransactionSemanticType;
  needsReview?: boolean;
  userId: string;
  userName?: string;
  merchant?: string;
}

export interface UpdateTransactionDTO {
  amount?: number;
  category?: string;
  categoryId?: string;
  description?: string;
  date?: string;
  type?: 'income' | 'expense';
  semanticType?: TransactionSemanticType;
  needsReview?: boolean;
  merchant?: string;
}
