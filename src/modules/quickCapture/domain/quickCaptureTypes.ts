import { TransactionSemanticType } from '../../transaction/domain/transactionSemanticType';
import { DetectedDebt } from '../../voiceProcessing/domain/processedTransaction';

/**
 * Quick Capture is the shared application boundary every client (Telegram, Mini App,
 * iPhone Shortcut) goes through. These types are the API contract; keep them free of
 * transport/persistence concerns so all three clients can depend on them.
 */

export const CAPTURE_SOURCES = ['telegram', 'miniapp', 'ios_shortcut'] as const;

export type CaptureSource = typeof CAPTURE_SOURCES[number];

export function isCaptureSource(value: unknown): value is CaptureSource {
  return typeof value === 'string' && (CAPTURE_SOURCES as readonly string[]).includes(value);
}

/**
 * `draft` is intentionally absent: there is no parse-without-save path today, and a
 * status the code cannot produce would be a lie in the contract.
 */
export type QuickCaptureStatus = 'saved' | 'needs_review' | 'no_transaction';

export interface QuickCaptureRequest {
  text: string;
  userId: string;
  userName?: string;
  /** Accepted and echoed back for client-side routing. Not persisted — the Transaction entity has no source column. */
  source?: CaptureSource;
}

export interface CapturedTransaction {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  semanticType: TransactionSemanticType;
  category: string;
  description?: string;
  merchant?: string;
  date: string;
  confidence?: number;
  needsReview: boolean;
  /** Mirrors `countsAsRealExpense()` so clients never have to re-derive transfer/savings semantics. */
  countsAsRealExpense: boolean;
}

/**
 * Debts are persisted by the same text pipeline, so they travel with the capture result.
 * Aliased rather than restated so the two shapes cannot drift apart.
 */
export type CapturedDebt = DetectedDebt;

export type CaptureAckAction = 'edit' | 'delete' | 'review';

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
