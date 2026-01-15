// Transaction types
export interface Transaction {
  id?: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  userId: string;
  userName?: string;
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
  category: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  userId: string;
  userName?: string;
  merchant?: string;
}

export interface UpdateTransactionDTO {
  amount?: number;
  category?: string;
  description?: string;
  date?: string;
  type?: 'income' | 'expense';
  merchant?: string;
}
