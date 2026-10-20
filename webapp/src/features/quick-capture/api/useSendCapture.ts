import { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCategories } from '@/entities/category';
import { useUserStore } from '@/entities/user';
import { ROUTES } from '@/shared/lib/constants/routes';
import type { OpenedFromState } from '@/shared/lib/navigation';
import { showUndoToast } from '@/shared/lib/undo';
import { NOT_UNDERSTOOD, sendFailedNotice, type CaptureNotice } from '../model/captureNotices';
import { reviewSessionFrom } from '../model/captureReview';
import { useCaptureStore } from '../model/captureStore';
import { validateCaptureText } from '../model/validateCaptureText';
import { useQuickCapture } from './mutations';

function notify(notice: CaptureNotice): void {
  showUndoToast({ kind: 'info', title: notice.title, detail: notice.detail });
}

/**
 * The composer's send (FT-114): the phrase goes to POST /api/quick-capture, which writes its records at once;
 * the records — one or several — open one review screen, and the field is emptied. A phrase that made
 * nothing keeps the text and says what to write; a failed send keeps it too and says why.
 */
export function useSendCapture() {
  const capture = useQuickCapture();
  const userId = useUserStore((state) => state.userId);
  const userName = useUserStore((state) => state.userName);
  const categories = useCategories();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // One client id per phrase as sent (FT-106): a press again after a lost answer gets the records the server
  // already wrote instead of writing them twice. A written phrase is done: the next send is a new capture.
  const attempt = useRef<{ text: string; clientId: string } | null>(null);

  const send = async (raw: string) => {
    if (!userId || capture.isPending) return;
    const validation = validateCaptureText(raw);
    if (!validation.ok) return;

    const text = validation.text;
    if (attempt.current?.text !== text) attempt.current = { text, clientId: crypto.randomUUID() };

    let result;
    try {
      result = await capture.mutateAsync({ text, userId, userName: userName || undefined, clientId: attempt.current.clientId });
    } catch (error) {
      notify(sendFailedNotice(error));
      return;
    }
    attempt.current = null;

    const session = reviewSessionFrom(result, categories.data ?? []);
    if (!session.items.some((item) => !item.removed)) {
      notify(NOT_UNDERSTOOD);
      return;
    }

    const store = useCaptureStore.getState();
    store.openReview(session);
    store.setDraft('');
    const state: OpenedFromState = { from: pathname };
    navigate(ROUTES.CAPTURE_REVIEW, { state });
  };

  return { send, isPending: capture.isPending };
}
