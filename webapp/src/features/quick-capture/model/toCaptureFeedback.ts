import type { CaptureAckAction, CaptureReviewReason, QuickCaptureResult } from './types';

export type CaptureFeedbackTone = 'success' | 'warning' | 'info';

export interface CaptureFeedback {
  tone: CaptureFeedbackTone;
  /** Server ack title — the same words Telegram shows for the same capture. */
  title: string;
  description?: string;
  /**
   * Server ack `details` — the secondary line (date, "Не входит в расходы",
   * "Проверьте в разделе долгов"). For a debt-only capture it is the only text that says
   * where the record went, so it is carried through instead of dropped.
   */
  details?: string;
  savedTransactionCount: number;
  savedDebtCount: number;
  /** True only when the pipeline actually wrote something. `no_transaction` never claims a save. */
  didPersist: boolean;
  needsAttention: boolean;
  reviewReasons: CaptureReviewReason[];
  /** Ack hints (`edit`/`delete`/`review`). Not implemented here — see `toCaptureActionHint()`. */
  actions: CaptureAckAction[];
}

/**
 * Turns a QuickCaptureResult into the honest UI feedback for it.
 *
 * Everything in `transactions`/`debts` is already in the database by the time the response
 * arrives, so `needs_review` means "correct a saved row", not "confirm a draft".
 */
export function toCaptureFeedback(result: QuickCaptureResult): CaptureFeedback {
  const savedTransactionCount = result.transactions.length;
  const savedDebtCount = result.debts.length;
  const didPersist = savedTransactionCount > 0 || savedDebtCount > 0;

  const tone: CaptureFeedbackTone =
    result.status === 'saved' ? 'success' : result.status === 'needs_review' ? 'warning' : 'info';

  return {
    tone,
    title: result.ack.title,
    description: result.ack.summary || undefined,
    details: result.ack.details || undefined,
    savedTransactionCount,
    savedDebtCount,
    didPersist,
    needsAttention: result.status === 'needs_review',
    reviewReasons: result.review.reasons,
    actions: result.ack.actions,
  };
}
