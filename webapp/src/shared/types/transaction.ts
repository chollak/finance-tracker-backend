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
  amount: number;
  /** Integer minor units (FT-097); `amount` is the same value in сум. */
  amountMinor?: number;
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
  description: string;
  amount: number;
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
