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
}

export interface CapturedTransaction {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  semanticType: TransactionSemanticType;
  /** Category id (`"transport"`), not a display name. */
  category: string;
  description?: string;
  merchant?: string;
  date: string;
  confidence?: number;
  needsReview: boolean;
  countsAsRealExpense: boolean;
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
}
