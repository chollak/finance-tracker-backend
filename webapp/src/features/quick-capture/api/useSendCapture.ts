import { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAccounts } from '@/entities/account';
import { useCategories } from '@/entities/category';
import { useSettings } from '@/entities/settings';
import { writeOnDevice } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { ROUTES } from '@/shared/lib/constants/routes';
import { toLocalDate } from '@/shared/lib/dates';
import type { OpenedFromState } from '@/shared/lib/navigation';
import { isOffline } from '@/shared/lib/offline';
import { showUndoToast } from '@/shared/lib/undo';
import {
  NO_DOLLAR_ACCOUNT,
  NOT_UNDERSTOOD,
  OFFLINE_NOT_UNDERSTOOD,
  sendFailedNotice,
  type CaptureNotice,
} from '../model/captureNotices';
import { offlineRecords, parseOfflineText } from '../model/offlineText';
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
 *
 * Without a connection (FT-129) the phrase is read on the device — only a simple «what and how much» — and its records
 * are written there, into the outbox; the field is emptied and the toast says they go with the connection. A send
 * that got no answer keeps the text as before: its client id makes a press again safe (FT-106), where records read
 * on the device after it could duplicate what the server did get.
 */
export function useSendCapture() {
  const queryClient = useQueryClient();
  const accounts = useAccounts();
  const settings = useSettings();
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
    if (isOffline()) {
      writeOffline(text, userId);
      return;
    }
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

  /** A simple phrase read on the device and written into the outbox (board «Главная без связи»). */
  const writeOffline = (text: string, userId: string) => {
    const items = parseOfflineText(text);
    if (!items) {
      notify(OFFLINE_NOT_UNDERSTOOD);
      return;
    }
    const result = offlineRecords(items, {
      categories: categories.data ?? [],
      accounts: accounts.data?.accounts ?? [],
      defaultAccountId: settings.data?.defaultAccountId,
      today: toLocalDate(new Date()),
    });
    if (!result.ok) {
      notify(NO_DOLLAR_ACCOUNT);
      return;
    }
    writeOnDevice(queryClient, userId, result.records);
    useCaptureStore.getState().setDraft('');
  };

  return { send, isPending: capture.isPending };
}
