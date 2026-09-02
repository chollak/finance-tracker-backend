/** Mirrors MAX_TEXT_LENGTH in the quick capture route handler. */
export const MAX_CAPTURE_TEXT_LENGTH = 2000;

export type CaptureTextRejection = 'empty' | 'too_long';

export type CaptureTextValidation =
  | { ok: true; text: string }
  | { ok: false; reason: CaptureTextRejection };

/**
 * Client-side copy of the server's `text` validation, in the same order the route checks it
 * (blank first, then length on the raw string). It only saves a round trip — the server
 * still validates every request.
 */
export function validateCaptureText(raw: string): CaptureTextValidation {
  if (raw.trim().length === 0) {
    return { ok: false, reason: 'empty' };
  }

  if (raw.length > MAX_CAPTURE_TEXT_LENGTH) {
    return { ok: false, reason: 'too_long' };
  }

  return { ok: true, text: raw.trim() };
}

/** Russian message for a rejection, matching the tone of the server ack wording. */
export function captureTextRejectionMessage(reason: CaptureTextRejection): string {
  return reason === 'empty'
    ? 'Введите текст операции'
    : `Слишком длинный текст (максимум ${MAX_CAPTURE_TEXT_LENGTH} символов)`;
}
