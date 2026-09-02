// Quick Capture feature barrel — client boundary for POST /api/quick-capture.
// Contract: docs/QUICK_CAPTURE_API.md

export { useQuickCapture, CaptureTextError } from './api/mutations';
export type { QuickCaptureInput } from './api/mutations';
export { quickCaptureInvalidationKeys } from './api/invalidation';

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
  QuickCaptureStatus,
  QuickCaptureRequest,
  QuickCaptureResult,
  CapturedTransaction,
  CapturedDebt,
  CaptureAck,
  CaptureAckAction,
  CaptureReview,
  CaptureReviewReason,
} from './model/types';
export { CAPTURE_SOURCES } from './model/types';
