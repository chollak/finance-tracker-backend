import { showUndoToast } from '@/shared/lib/undo';
import { savedToastDetail, type ManualEntryRecord } from './manualEntry';

interface SavedRecord {
  /** The id the written record got. */
  id: string;
  record: ManualEntryRecord;
  accountName: string | undefined;
  /** Removes the record: «Отменить» really takes it back (FT-105 soft delete). */
  remove: (id: string) => Promise<void> | void;
}

/**
 * «Записано» with «Отменить» (Toast.md) after a manual entry is saved (FT-113). The toast lives in a store,
 * so it shows on Home after the entry screen is gone, and its undo does not need that screen.
 */
export function announceSaved({ id, record, accountName, remove }: SavedRecord): string {
  return showUndoToast({
    kind: 'saved',
    title: 'Записано',
    detail: savedToastDetail(record, accountName),
    undo: () => remove(id),
  });
}
