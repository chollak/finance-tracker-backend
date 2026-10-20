import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { deleteTransaction, patchTransaction, restoreTransaction } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { showUndoToast } from '@/shared/lib/undo';
import {
  cancelTypeChange,
  categoryChangedToast,
  chooseCategory as chooseCategoryOf,
  chooseType as chooseTypeOf,
  deletedToast,
  revertSheetChange,
  type RecordType,
  type SheetChange,
  type SheetContext,
  type SheetState,
} from '../model/recordSheet';
import { closeRecordSheet, flashRecord } from '../model/recordSheetStore';

/** How long «✓ Сохранено» shows after a change was saved (TxnSheet.md). */
export const SAVED_NOTICE_MS = 2000;

/** The line under the fields: the hint, «Сохранено» for 2 seconds, or what went wrong. */
export type SaveStatus = 'idle' | 'saved' | 'save-failed' | 'delete-failed';

const SAVE_FAILED_TOAST = { title: 'Не получилось сохранить', detail: 'Проверьте связь и измените ещё раз' } as const;

/**
 * What the record sheet does with a saved record (FT-115). Every change shows at once and is patched to the
 * record at once; «Сохранено» shows for 2 seconds after the server took it; a change it refused goes back and
 * the sheet says so (a toast, when the sheet is already closed). «Готово» closes the sheet and rings the row
 * that was changed. «Удалить операцию» deletes without asking, with «Отменить» in the toast.
 *
 * `loaded` is the sheet of the record as read; changes are kept apart from it, so a read that answers late
 * does not undo them.
 */
export function useRecordEdits(id: string, loaded: SheetState | null, context: SheetContext) {
  const queryClient = useQueryClient();
  const userId = useUserStore((state) => state.userId);
  const [edited, setEdited] = useState<SheetState | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [deleting, setDeleting] = useState(false);
  // The state as it is now: a handler may run right after another one, before React renders it
  const current = useRef<SheetState | null>(null);
  // Something was sent: closing rings the row
  const changed = useRef(false);
  const mounted = useRef(true);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(savedTimer.current);
    };
  }, []);

  const read = (): SheetState | null => current.current ?? loaded;
  const write = (next: SheetState) => {
    current.current = next;
    setEdited(next);
  };

  const showSaved = () => {
    clearTimeout(savedTimer.current);
    setStatus('saved');
    savedTimer.current = setTimeout(() => setStatus('idle'), SAVED_NOTICE_MS);
  };

  /** One change: shown at once, then saved; refused — put back. */
  const apply = async (make: (state: SheetState) => SheetChange | null) => {
    const before = read();
    const made = before && make(before);
    if (!userId || !before || !made) return;
    write(made.state);
    if (!made.patch) return;
    changed.current = true;
    try {
      await patchTransaction(queryClient, { id, userId, patch: made.patch });
      if (mounted.current) showSaved();
    } catch {
      const latest = read();
      if (latest) write(revertSheetChange(latest, before, made.state));
      if (mounted.current) {
        clearTimeout(savedTimer.current);
        setStatus('save-failed');
      } else {
        showUndoToast({ kind: 'info', ...SAVE_FAILED_TOAST });
      }
    }
  };

  /** «Расход / Доход»: returns whether a category of the new type is to be chosen now. */
  const chooseType = (type: RecordType): boolean => {
    const state = read();
    if (!state) return false;
    const next = chooseTypeOf(state, type);
    write(next);
    return next.typeChange !== null;
  };

  /** The category choice was closed without a choice: after «Расход / Доход» the type comes back. */
  const leaveCategoryChoice = () => {
    const state = read();
    if (state?.typeChange) write(cancelTypeChange(state));
  };

  /** «Готово», «Закрыть», the scrim: the sheet goes; the row it changed is ringed. */
  const close = () => {
    closeRecordSheet();
    if (changed.current) flashRecord(id);
  };

  /** «Удалить операцию»: no question; «Удалено» with «Отменить» brings it back. */
  const remove = async () => {
    const state = read();
    if (!userId || !state || deleting) return;
    setDeleting(true);
    try {
      await deleteTransaction(queryClient, { id, userId });
    } catch {
      setDeleting(false);
      setStatus('delete-failed');
      return;
    }
    closeRecordSheet();
    showUndoToast({
      kind: 'deleted',
      ...deletedToast(state.record, context),
      undo: () => restoreTransaction(queryClient, { id, userId }),
    });
  };

  /**
   * The quick choice from a row's circle: the choice closes at once and the row is ringed; once saved, «Категория
   * изменена» with «Отменить», which puts the category back.
   */
  const quickCategory = async (categoryId: string) => {
    const state = read();
    closeRecordSheet();
    if (!userId || !state) return;
    const { patch } = chooseCategoryOf(state, categoryId);
    if (!patch) return;
    flashRecord(id);
    const previous = state.record.categoryId;
    try {
      await patchTransaction(queryClient, { id, userId, patch });
    } catch {
      showUndoToast({ kind: 'info', ...SAVE_FAILED_TOAST });
      return;
    }
    showUndoToast({
      kind: 'changed',
      ...categoryChangedToast(previous, categoryId, context),
      ...(previous
        ? { undo: async () => void (await patchTransaction(queryClient, { id, userId, patch: { categoryId: previous } })) }
        : {}),
    });
  };

  return {
    state: edited ?? loaded,
    status,
    deleting,
    apply,
    chooseType,
    leaveCategoryChoice,
    close,
    remove,
    quickCategory,
  };
}
