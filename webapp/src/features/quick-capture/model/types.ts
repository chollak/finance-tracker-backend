import type { TransactionSemanticType } from '@/shared/types';

/**
 * Client mirror of the shipped POST /api/quick-capture contract.
 * Source of truth: `src/modules/quickCapture/domain/quickCaptureTypes.ts` and
 * `docs/QUICK_CAPTURE_API.md`. Keep the two in sync — there is no generated client.
 */

export const CAPTURE_SOURCES = ['telegram', 'miniapp', 'ios_shortcut'] as const;

export type CaptureSource = typeof CAPTURE_SOURCES[number];

/** No `draft`: the endpoint has no parse-without-save path, so every result is already persisted. */
export type QuickCaptureStatus = 'saved' | 'needs_review' | 'no_transaction';

export interface QuickCaptureRequest {
  text: string;
  userId: string;
  userName?: string;
  source?: CaptureSource;
  /** The client's id for this capture (FT-106): a repeat answers with the records of the first one. */
  clientId?: string;
}

/**
 * What the parse took for granted (FT-103): «45» read as 45 000, a category no word of the record names (FT-138:
 * the AI's own choice, or «Другое» for a word nothing recognised — not one its name, the category dictionary or a
 * learned pattern gave), the account it chose, dollars parked on a сум account.
 */
export type CaptureAssumption =
  | { kind: 'thousands'; written: string; amount: number }
  | { kind: 'category'; name: string }
  | { kind: 'account'; name: string; reason: 'hint' | 'default' }
  | { kind: 'currency'; currency: 'USD'; reason: 'no_usd_account' };

export interface CapturedTransaction {
  id: string;
  /** In the record's currency, major units. */
  amount: number;
  /** The same in integer minor units (FT-114). */
  amountMinor?: number;
  currency?: 'UZS' | 'USD';
  accountId?: string;
  accountName?: string;
  /** Not on a repeated capture: they are not stored. */
  assumptions?: CaptureAssumption[];
  type: 'income' | 'expense';
  semanticType: TransactionSemanticType;
  /** The current name of the record's category. */
  category: string;
  /** The user's category (FT-114). */
  categoryId?: string;
  description?: string;
  merchant?: string;
  date: string;
  confidence?: number;
  needsReview: boolean;
  countsAsRealExpense: boolean;
  /** Only on a repeated capture whose record was deleted since (FT-106). */
  deletedAt?: string;
}

export interface CapturedDebt {
  id: string;
  debtType: 'i_owe' | 'owed_to_me';
  personName: string;
  amount: number;
  dueDate?: string | null;
  description?: string;
  confidence?: number;
  linkedTransactionId?: string;
}

export type CaptureAckAction = 'edit' | 'delete' | 'review';

/** Ready-to-render Russian confirmation, shared with the Telegram bot. */
export interface CaptureAck {
  title: string;
  summary: string;
  details?: string;
  actions: CaptureAckAction[];
}

export type CaptureReviewReason = 'transaction_needs_review' | 'debt_detected';

export interface CaptureReview {
  reasons: CaptureReviewReason[];
}

export interface QuickCaptureResult {
  status: QuickCaptureStatus;
  text: string;
  source?: CaptureSource;
  transactions: CapturedTransaction[];
  debts: CapturedDebt[];
  ack: CaptureAck;
  review: CaptureReview;
  /** A repeated `clientId` (FT-106): nothing new was written. */
  repeated?: boolean;
}
