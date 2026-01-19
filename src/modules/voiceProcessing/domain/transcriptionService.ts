/**
 * Parsed transaction from voice/text input
 */
export interface ParsedTransaction {
  intent: 'transaction';
  amount: number;
  category: string;
  type: 'income' | 'expense';
  date: string;
  merchant?: string;
  confidence?: number;
  description?: string;
}

/**
 * Parsed debt from voice/text input
 */
export interface ParsedDebt {
  intent: 'debt';
  debtType: 'i_owe' | 'owed_to_me';
  personName: string;
  amount: number;
  dueDate?: string | null;
  description?: string;
  moneyTransferred: boolean;
  confidence?: number;
}

/**
 * Union type for all parsed items
 */
export type ParsedItem = ParsedTransaction | ParsedDebt;

/**
 * Result of analyzing text input
 */
export interface AnalysisResult {
  transactions: ParsedTransaction[];
  debts: ParsedDebt[];
}

export interface TranscriptionService {
  transcribe(filePath: string): Promise<string>;

  /**
   * @deprecated Use analyzeInput instead
   */
  analyzeTransactions(text: string): Promise<ParsedTransaction[]>;

  /**
   * Analyze text and extract both transactions and debts
   */
  analyzeInput(text: string): Promise<AnalysisResult>;
}
