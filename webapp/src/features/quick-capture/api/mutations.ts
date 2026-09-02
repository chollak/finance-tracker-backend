import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import { isGuestId } from '@/shared/lib/utils/guestId';
import { haptic } from '@/shared/lib/haptic';
import { GuestAccessError } from '@/entities/transaction/api/mutations';

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

export interface QuickCaptureInput {
  text: string;
  userId: string;
  userName?: string;
}

/**
 * Hook for POST /api/quick-capture — the shared capture boundary the Telegram bot already uses.
 *
 * Guest users are rejected: their transactions live in IndexedDB only
 * (`transactionDataSource`), while this endpoint writes server-side, so a guest capture would
 * save into a store the Mini App never reads back.
 *
 * The result is returned as-is; `toCaptureFeedback()` turns it into honest UI wording. Nothing
 * here fakes a save — `no_transaction` invalidates no cache and reports no saved rows.
 */
export function useQuickCapture() {
  const queryClient = useQueryClient();

  return useMutation<QuickCaptureResult, Error, QuickCaptureInput>({
    mutationFn: async ({ text, userId, userName }) => {
      if (isGuestId(userId)) {
        throw new GuestAccessError('быстрой записи текстом');
      }

      const validation = validateCaptureText(text);
      if (!validation.ok) {
        throw new CaptureTextError(validation.reason);
      }

      const response = await apiClient.post<QuickCaptureResult>(API_ENDPOINTS.QUICK_CAPTURE, {
        text: validation.text,
        userId,
        userName,
        source: 'miniapp',
      });

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
