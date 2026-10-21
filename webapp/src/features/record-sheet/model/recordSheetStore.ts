import { create } from 'zustand';
import type { Transaction } from '@/shared/types';

/** How long the row just changed stays ringed (TransactionList.md). */
export const RECORD_FLASH_MS = 2000;

/** Which record's sheet is open and how. */
export interface RecordSheetTarget {
  id: string;
  /** `sheet` — the whole sheet (a row); `category` — the quick choice of a category (the row's circle). */
  view: 'sheet' | 'category';
  /** The record as the list that opened it has it: shown until the record is read. */
  seed?: Transaction;
  /**
   * The screen (pathname) the sheet is open on, set by that screen's `RecordSheet`: leaving the screen — with
   * Telegram's «Назад» too — closes the sheet instead of carrying it to the next one.
   */
  screen?: string;
}

interface RecordSheetState {
  target: RecordSheetTarget | null;
  /** The row just changed: ringed for `RECORD_FLASH_MS`. */
  flashId: string | null;
}

/**
 * The record sheet of FT-115, one per screen: any list opens it (Home's recent records, History, a link with
 * `?record=`), the screen mounts `RecordSheet` once, and the list rings the row it changed.
 */
export const useRecordSheetStore = create<RecordSheetState>()(() => ({ target: null, flashId: null }));

let flashTimer: ReturnType<typeof setTimeout> | undefined;

/** A row: the whole sheet of its record. */
export function openRecordSheet(id: string, seed?: Transaction): void {
  useRecordSheetStore.setState({ target: { id, view: 'sheet', seed } });
}

/** A row's category circle: the choice of a category at once, over the list (Picker.md). */
export function openRecordCategory(id: string, seed?: Transaction): void {
  useRecordSheetStore.setState({ target: { id, view: 'category', seed } });
}

/** «Вся операция ›» in the quick choice: the whole sheet of the same record. */
export function showWholeRecord(): void {
  const { target } = useRecordSheetStore.getState();
  if (target) useRecordSheetStore.setState({ target: { ...target, view: 'sheet' } });
}

export function closeRecordSheet(): void {
  useRecordSheetStore.setState({ target: null });
}

/** Rings the row of a record just changed for 2 seconds; another change starts over for its own row. */
export function flashRecord(id: string): void {
  clearTimeout(flashTimer);
  useRecordSheetStore.setState({ flashId: id });
  flashTimer = setTimeout(() => {
    if (useRecordSheetStore.getState().flashId === id) useRecordSheetStore.setState({ flashId: null });
  }, RECORD_FLASH_MS);
}

/** The row to ring now, for a list that shows records. */
export function useRecordFlash(): string | null {
  return useRecordSheetStore((state) => state.flashId);
}
