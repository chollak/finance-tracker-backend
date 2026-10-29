import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import { haptic } from '@/shared/lib/haptic';

import { quickCaptureInvalidationKeys } from './invalidation';
import { toCaptureFeedback, type CaptureFeedback } from '../model/toCaptureFeedback';
import {
  validateCaptureText,
  captureTextRejectionMessage,
  type CaptureTextRejection,
} from '../model/validateCaptureText';
import type { QuickCaptureResult } from '../model/types';

/** Thrown before the request when the text cannot pass the server's own validation. */
export class CaptureTextError extends Error {
  readonly reason: CaptureTextRejection;

  constructor(reason: CaptureTextRejection) {
    super(captureTextRejectionMessage(reason));
    this.name = 'CaptureTextError';
    this.reason = reason;
  }
}

/**
 * How long the composer waits for a phrase to be read (FT-146) before it gives up and keeps the text in the field.
 *
 * Longer than the server's own worst case, so a slow AI still ends in the server's answer: the AI usually answers in
 * 1–5 s, but the server waits for it `OPENAI_TIMEOUT_MS` (20 s), asks once more after the SDK's pause (under 1 s) and
 * waits 20 s again (FT-145) — about 41 s before it answers, with records or with its 502. 45 s leaves a margin for the
 * write and the trip. A shorter wait gave up on answers that came at 30–41 s: the records were written, and a phrase
 * corrected and sent again wrote a second set.
 *
 * Giving up therefore means the server did not answer at all (the connection or the tunnel hung). Sending again is safe:
 * the same client id (FT-106) returns the records the server may have written instead of writing them twice.
 */
export const QUICK_CAPTURE_TIMEOUT_MS = 45_000;

export interface QuickCaptureInput {
  text: string;
  userId: string;
  userName?: string;
  /** One per phrase as sent (FT-106): sending it again after a lost answer returns the same records. */
  clientId?: string;
}

/**
 * Hook for POST /api/quick-capture — the shared capture boundary the Telegram bot already uses.
 *
 * The result is returned as-is; `toCaptureFeedback()` turns it into honest UI wording. Nothing
 * here fakes a save — `no_transaction` invalidates no cache and reports no saved rows.
 */
export function useQuickCapture() {
  const queryClient = useQueryClient();

  return useMutation<QuickCaptureResult, Error, QuickCaptureInput>({
    mutationFn: async ({ text, userId, userName, clientId }) => {
      const validation = validateCaptureText(text);
      if (!validation.ok) {
        throw new CaptureTextError(validation.reason);
      }

      const response = await apiClient.post<QuickCaptureResult>(
        API_ENDPOINTS.QUICK_CAPTURE,
        {
          text: validation.text,
          userId,
          userName,
          source: 'miniapp',
          ...(clientId ? { clientId } : {}),
        },
        { timeoutMs: QUICK_CAPTURE_TIMEOUT_MS }
      );

      return response.data;
    },
    onSuccess: (result, variables) => {
      const feedback = toCaptureFeedback(result);

      if (!feedback.didPersist) {
        // Nothing was written — no haptic "success", no cache churn.
        return;
      }

      if (feedback.needsAttention) {
        haptic.warning();
      } else {
        haptic.success();
      }

      for (const queryKey of quickCaptureInvalidationKeys(result, variables.userId)) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: () => {
      haptic.error();
    },
  });
}

export type { CaptureFeedback };
