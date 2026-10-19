// Quick Capture feature (FT-114): the composer at the bottom of Home — quick chips that write in one tap and
// a field whose text goes to POST /api/quick-capture — and the review of the records a phrase made.
// Contract: docs/QUICK_CAPTURE_API.md

export { Composer } from './ui/Composer';
export { ComposerView, type ComposerViewProps } from './ui/ComposerView';
export { CaptureReview } from './ui/CaptureReview';
export { CaptureReviewView, type CaptureReviewViewProps } from './ui/CaptureReviewView';

export { useQuickCapture, CaptureTextError } from './api/mutations';
export type { QuickCaptureInput } from './api/mutations';
export { quickCaptureInvalidationKeys } from './api/invalidation';
export { useCaptureStore } from './model/captureStore';

export { STARTER_CHIPS, quickChips, type QuickChip, type QuickChipRecord } from './model/quickChips';
export {
  reviewSessionFrom,
  reviewModel,
  type ReviewContext,
  type ReviewItem,
  type ReviewModel,
  type ReviewSession,
} from './model/captureReview';

export { toCaptureFeedback } from './model/toCaptureFeedback';
export type { CaptureFeedback, CaptureFeedbackTone } from './model/toCaptureFeedback';
export {
  validateCaptureText,
  captureTextRejectionMessage,
  MAX_CAPTURE_TEXT_LENGTH,
} from './model/validateCaptureText';
export type { CaptureTextValidation, CaptureTextRejection } from './model/validateCaptureText';

export type {
  CaptureSource,
  CaptureAssumption,
  QuickCaptureStatus,
  QuickCaptureRequest,
  QuickCaptureResult,
  CapturedTransaction,
  CapturedDebt,
  CaptureAck,
  CaptureAckAction,
  CaptureReview as CaptureReviewReasons,
  CaptureReviewReason,
} from './model/types';
export { CAPTURE_SOURCES } from './model/types';
