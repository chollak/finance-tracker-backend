import { TransactionSemanticType } from '../../transaction/domain/transactionSemanticType';

/**
 * What the parse took for granted (FT-103), so the bot and the screens can show it and ask:
 * «"45" понял как 45 000 сум», «Записал в «Покупки» — верно?», the account it chose, dollars
 * parked on a сум account because there is no dollar account.
 */
export type CaptureAssumption =
  | { kind: 'thousands'; written: string; amount: number }
  | { kind: 'category'; name: string }
  | { kind: 'account'; name: string; reason: 'hint' | 'default' }
  | { kind: 'currency'; currency: 'USD'; reason: 'no_usd_account' };

export interface DetectedTransaction {
  id: string;
  /** In the record's currency, major units (сум or dollars). */
  amount: number;
  amountMinor?: number;
  currency?: 'UZS' | 'USD';
  accountId?: string;
  accountName?: string;
  assumptions?: CaptureAssumption[];
  category: string;
  type: 'income' | 'expense';
  semanticType?: TransactionSemanticType;
  needsReview?: boolean;
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
