import { TransactionSemanticType } from '../../transaction/domain/transactionSemanticType';
import { AnalysisContext } from './categoryPrompt';
import { ItemWithoutAmount } from './processedTransaction';

/**
 * Parsed transaction from voice/text input
 */
export interface ParsedTransaction {
  intent: 'transaction';
  amount: number;
  /** A category name as the parser saw it; resolved to the user's category on create (FT-099). */
  category: string;
  /** Dollars when the text says so («$», «долл», «usd»); сум otherwise (FT-103). */
  currency?: 'UZS' | 'USD';
  /** «нал» → cash, «картой» → card, when the parser tells it per item (FT-103). */
  paymentKind?: 'cash' | 'card';
  type: 'income' | 'expense';
  semanticType?: TransactionSemanticType;
  needsReview?: boolean;
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
 * Result of analyzing text input. `debts` stays for the response shape but is always empty: debt
 * parsing is off (decision Д2) — debts are recorded as expenses in «Другое».
 */
export interface AnalysisResult {
  transactions: ParsedTransaction[];
  debts: ParsedDebt[];
  /** Named without an amount («такси» in «кофе 25к, такси»): nothing is written for them (FT-123). */
  withoutAmount?: ItemWithoutAmount[];
}

export interface TranscriptionService {
  transcribe(filePath: string): Promise<string>;

  /**
   * @deprecated Use analyzeInput instead
   */
  analyzeTransactions(text: string): Promise<ParsedTransaction[]>;

  /**
   * Analyze text and extract transactions, choosing among the user's categories when given
   */
  analyzeInput(text: string, context?: AnalysisContext): Promise<AnalysisResult>;

  /**
   * The expense category of a card payment by its merchant alone (FT-176): the name of one of the user's categories
   * (`context.categories`), «Другое» when none fits. Nothing else is read — the amount, currency, date and account of a
   * payment come ready.
   */
  categoryOfMerchant(merchant: string, context?: AnalysisContext): Promise<string>;
}
