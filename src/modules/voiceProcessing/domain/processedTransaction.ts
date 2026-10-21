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
  /** The current name of the record's category. */
  category: string;
  /** The user's category the record went to (FT-099), so a screen can show and change it by id (FT-114). */
  categoryId?: string;
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

/**
 * Something the phrase names without an amount: «такси» in «кофе 25к, такси, обед 45» (FT-123). Nothing is
 * written for it; the bot asks «Сколько?» and writes it with the amount of the answer
 * (`ProcessTextInputUseCase.executeWithAmount`).
 */
export interface ItemWithoutAmount {
  /** As the phrase names it: «такси». */
  description: string;
  /** The category the parser chose, by name; resolved like any record's when it is written. */
  category: string;
  type: 'income' | 'expense';
  semanticType?: TransactionSemanticType;
  /** YYYY-MM-DD; today when the phrase does not say. */
  date?: string;
  /** «нал», «картой» said of this item. */
  paymentKind?: 'cash' | 'card';
  merchant?: string;
}

export interface ProcessedTransaction {
  text: string;
  transactions: DetectedTransaction[];
  debts: DetectedDebt[];
  /** Named without an amount, so not written (FT-123). */
  withoutAmount?: ItemWithoutAmount[];
}
