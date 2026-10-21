import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { deleteTransaction, patchTransaction, restoreTransaction } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { useShowHomeAfterSave } from '@/shared/lib/navigation';
import { dismissUndoGroup, showUndoToast } from '@/shared/lib/undo';
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
  restoreItem,
  revertChange,
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

/** The review is still open and still has this record (an undo or a late answer may come after it ended). */
function isOpenWith(id: string): boolean {
  const session = current();
  return !!session && !!findItem(session, id);
}

/**
 * The «Убрано» toasts of the review. They live only as long as it does: once the phrase is saved or taken
 * back, «Отменить» on one would bring back a record of a phrase that is over (a stray record, written twice
 * if the phrase is sent again).
 */
const REMOVED_TOASTS = 'capture-review-removed';

/** `apiClient` rejects with `{ statusCode }`: a 404 is a record already deleted (a retry after a lost answer). */
function alreadyGone(reason: unknown): boolean {
  return typeof reason === 'object' && reason !== null && (reason as { statusCode?: unknown }).statusCode === 404;
}

/** Deletes the records, each on its own; returns the ids that are still there. */
async function deleteRecords(queryClient: QueryClient, userId: string, ids: readonly string[]): Promise<string[]> {
  const results = await Promise.allSettled(ids.map((id) => deleteTransaction(queryClient, { id, userId })));
  return ids.filter((_, index) => {
    const result = results[index];
    return result.status === 'rejected' && !alreadyGone(result.reason);
  });
}

/**
 * What the review screen does with the records the capture already saved (FT-114). Every change shows at once
 * and is patched to the saved record; one the server refuses is put back and the screen says so. «×» deletes
 * the record with «Отменить» («Убрано»), which lasts as long as the review. «Сохранить» shows Home with
 * «Записано», whose «Отменить» takes back every record of the phrase still on the screen. «Изменить» and
 * «Назад» take them back and return the phrase to the field: before «Сохранить» nothing was meant to be kept.
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
    const after = made && findItem(made.session, id);
    if (!userId || !before || !made || !after) return;
    updateReview(() => made.session);
    try {
      await patchTransaction(queryClient, { id, userId, patch: made.patch });
    } catch {
      // Only this change goes back: another one made meanwhile may have reached the server
      updateReview((latest) => revertChange(latest, before, after));
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
    // The review may have ended while the record was being deleted: then there is nothing to bring it back to
    if (!isOpenWith(id)) return;
    showUndoToast({
      kind: 'deleted',
      ...removedToast(item, context),
      group: REMOVED_TOASTS,
      undo: async () => {
        if (!isOpenWith(id)) return;
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
    // What was removed stays removed: «Записано» counts the records without it
    dismissUndoGroup(REMOVED_TOASTS);
    closeReview();
    let left = ids;
    showUndoToast({
      kind: 'saved',
      ...toast,
      undo: async () => {
        // A retry («Не получилось отменить») deletes only what the previous press could not
        left = await deleteRecords(queryClient, userId, left);
        if (left.length > 0) throw new Error(`${left.length} records of the phrase are still there`);
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
    // The whole phrase goes back, so a record removed from it does not come back with «Отменить»
    dismissUndoGroup(REMOVED_TOASTS);
    const live = liveItems(session).map((item) => item.id);
    const left = await deleteRecords(queryClient, userId, live);
    if (left.length > 0) {
      // What was deleted is gone from the screen; the rest can be taken back with another press
      live.filter((id) => !left.includes(id)).forEach((id) => updateReview((latest) => removeItem(latest, id)));
      notify(CANCEL_FAILED);
      return;
    }
    setDraft(session.text);
    closeReview();
    leave();
  };

  return { chooseCategory, chooseAccount, chooseDate, convert, remove, save, cancel };
}
