// Quick Capture feature barrel — client boundary for POST /api/quick-capture.
// Contract: docs/QUICK_CAPTURE_API.md

export { useQuickCapture, CaptureTextError } from './api/mutations';
export type { QuickCaptureInput } from './api/mutations';
export { quickCaptureInvalidationKeys } from './api/invalidation';

export { TextQuickCaptureCard } from './ui/TextQuickCaptureCard';

export { toCaptureFeedback } from './model/toCaptureFeedback';
export type { CaptureFeedback, CaptureFeedbackTone } from './model/toCaptureFeedback';
export { toCaptureErrorFeedback } from './model/toCaptureErrorFeedback';
export type { CaptureErrorFeedback } from './model/toCaptureErrorFeedback';
export { toCaptureActionHint } from './model/toCaptureActionHint';
export { CAPTURE_EXAMPLES } from './model/captureExamples';
export type { CaptureExample } from './model/captureExamples';
export {
  CAPTURE_ACTIONS,
  captureActionAccessibleLabel,
  captureActionHintFor,
  nextActiveCaptureAction,
} from './model/captureActions';
export type { CaptureAction, CaptureActionId } from './model/captureActions';
export { toCaptureOfflineNotice, readOnlineStatus } from './model/toCaptureOfflineNotice';
export type { CaptureOfflineNotice } from './model/toCaptureOfflineNotice';
export { useIsOnline } from './model/useIsOnline';
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
