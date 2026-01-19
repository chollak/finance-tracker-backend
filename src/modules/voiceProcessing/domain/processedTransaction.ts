export interface DetectedTransaction {
  id: string;
  amount: number;
  category: string;
  type: 'income' | 'expense';
  date: string;
  merchant?: string;
  confidence?: number;
  description?: string;
}

export interface DetectedDebt {
  id: string;
  debtType: 'i_owe' | 'owed_to_me';
  personName: string;
  amount: number;
  dueDate?: string | null;
  description?: string;
  confidence?: number;
  linkedTransactionId?: string;
}

export interface ProcessedTransaction {
  text: string;
  transactions: DetectedTransaction[];
  debts: DetectedDebt[];
}
