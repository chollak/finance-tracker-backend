import { useQueryClient } from '@tanstack/react-query';
import { deleteTransaction, patchTransaction, restoreTransaction } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { useShowHomeAfterSave } from '@/shared/lib/navigation';
import { showUndoToast } from '@/shared/lib/undo';
import type { LocalDate } from '@/shared/lib/dates';
import { CANCEL_FAILED, CHANGE_FAILED, type CaptureNotice } from '../model/captureNotices';
import {
  applyConversion,
  capturedToast,
  chooseAccount as chooseAccountOf,
  chooseCategory as chooseCategoryOf,
  chooseDate as chooseDateOf,
  findItem,
  liveItems,
  removedToast,
  removeItem,
  replaceItem,
  restoreItem,
  type ReviewChange,
  type ReviewContext,
  type ReviewSession,
} from '../model/captureReview';
import { useCaptureStore } from '../model/captureStore';

function notify(notice: CaptureNotice): void {
  showUndoToast({ kind: 'info', title: notice.title, detail: notice.detail });
}

/** The session as it is now (a handler may run after other changes, so it never trusts a render's copy). */
const current = (): ReviewSession | null => useCaptureStore.getState().review;

/**
 * What the review screen does with the records the capture already saved (FT-114). Every change shows at once
 * and is patched to the saved record; one the server refuses is put back and the screen says so. «×» deletes
 * the record with «Отменить» («Убрано»). «Сохранить» shows Home with «Записано», whose «Отменить» takes back
 * every record of the phrase still on the screen. «Изменить» and «Назад» take them back and return the phrase
 * to the field: before «Сохранить» nothing was meant to be kept.
 */
export function useCaptureReview(context: ReviewContext) {
  const queryClient = useQueryClient();
  const userId = useUserStore((state) => state.userId);
  const showHome = useShowHomeAfterSave();
  const { updateReview, closeReview, setDraft } = useCaptureStore.getState();

  const change = async (id: string, make: (session: ReviewSession) => ReviewChange | null) => {
    const session = current();
    const before = session && findItem(session, id);
    const made = session && make(session);
    if (!userId || !before || !made) return;
    updateReview(() => made.session);
    try {
      await patchTransaction(queryClient, { id, userId, patch: made.patch });
    } catch {
      updateReview((latest) => replaceItem(latest, before));
      notify(CHANGE_FAILED);
    }
  };

  const chooseCategory = (id: string, categoryId: string) => change(id, (session) => chooseCategoryOf(session, id, categoryId));

  const chooseAccount = (id: string, accountId: string) => {
    const account = context.accounts.find((candidate) => candidate.id === accountId);
    return change(id, (session) => (account ? chooseAccountOf(session, id, account, context.rateMinor) : null));
  };

  const chooseDate = (id: string, date: LocalDate) => change(id, (session) => chooseDateOf(session, id, date));

  const convert = (id: string) => change(id, (session) => applyConversion(session, id));

  const remove = async (id: string) => {
    const session = current();
    const item = session && findItem(session, id);
    if (!userId || !item || item.removed) return;
    updateReview((latest) => removeItem(latest, id));
    try {
      await deleteTransaction(queryClient, { id, userId });
    } catch {
      updateReview((latest) => restoreItem(latest, id));
      notify(CHANGE_FAILED);
      return;
    }
    const toast = removedToast(item, context);
    showUndoToast({
      kind: 'deleted',
      ...toast,
      undo: async () => {
        await restoreTransaction(queryClient, { id, userId });
        updateReview((latest) => restoreItem(latest, id));
      },
    });
  };

  /** «Сохранить»: the records are kept as they are now; Home says so and can take them all back. */
  const save = () => {
    const session = current();
    if (!userId || !session) return;
    const ids = liveItems(session).map((item) => item.id);
    if (ids.length === 0) return;
    const toast = capturedToast(session, context);
    closeReview();
    showUndoToast({
      kind: 'saved',
      ...toast,
      undo: async () => {
        await Promise.all(ids.map((id) => deleteTransaction(queryClient, { id, userId })));
      },
    });
    showHome();
  };

  /**
   * «Изменить» or «Назад»: the records are taken back and the phrase returns to the field, then `leave` runs
   * (back to Home). Records that could not be taken back keep the review on screen, and it says so.
   */
  const cancel = async (leave: () => void) => {
    const session = current();
    if (!userId || !session) {
      leave();
      return;
    }
    const live = liveItems(session);
    const results = await Promise.allSettled(live.map((item) => deleteTransaction(queryClient, { id: item.id, userId })));
    const failed = results.some((result) => result.status === 'rejected');
    if (failed) {
      // What was deleted is gone from the screen; the rest can be taken back with another press
      live.forEach((item, index) => {
        if (results[index].status === 'fulfilled') updateReview((latest) => removeItem(latest, item.id));
      });
      notify(CANCEL_FAILED);
      return;
    }
    setDraft(session.text);
    closeReview();
    leave();
  };

  return { chooseCategory, chooseAccount, chooseDate, convert, remove, save, cancel };
}
