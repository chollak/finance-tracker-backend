import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeRecordSheet,
  flashRecord,
  openRecordCategory,
  openRecordSheet,
  RECORD_FLASH_MS,
  showWholeRecord,
  useRecordSheetStore,
} from './recordSheetStore';

/**
 * FT-115: which record's sheet is open and how — a row opens the whole sheet, its category circle the quick
 * choice of a category — and the row that was just changed, ringed for 2 seconds (TransactionList.md).
 */

beforeEach(() => {
  vi.useFakeTimers();
  useRecordSheetStore.setState({ target: null, flashId: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('opening', () => {
  it('a row opens the whole sheet of its record', () => {
    openRecordSheet('t4');

    expect(useRecordSheetStore.getState().target).toMatchObject({ id: 't4', view: 'sheet' });
  });

  it('the category circle opens the quick choice; «Вся операция» turns it into the whole sheet', () => {
    openRecordCategory('t4');
    expect(useRecordSheetStore.getState().target).toMatchObject({ id: 't4', view: 'category' });

    showWholeRecord();
    expect(useRecordSheetStore.getState().target).toMatchObject({ id: 't4', view: 'sheet' });
  });

  it('closing leaves nothing open', () => {
    openRecordSheet('t4');
    closeRecordSheet();

    expect(useRecordSheetStore.getState().target).toBeNull();
  });
});

describe('the changed row is ringed for 2 seconds', () => {
  it('then the ring goes', () => {
    flashRecord('t4');
    expect(RECORD_FLASH_MS).toBe(2000);
    expect(useRecordSheetStore.getState().flashId).toBe('t4');

    vi.advanceTimersByTime(1999);
    expect(useRecordSheetStore.getState().flashId).toBe('t4');

    vi.advanceTimersByTime(1);
    expect(useRecordSheetStore.getState().flashId).toBeNull();
  });

  it('another change starts the 2 seconds over for its own row', () => {
    flashRecord('t4');
    vi.advanceTimersByTime(1500);
    flashRecord('t1');
    vi.advanceTimersByTime(1500);

    expect(useRecordSheetStore.getState().flashId).toBe('t1');
    vi.advanceTimersByTime(500);
    expect(useRecordSheetStore.getState().flashId).toBeNull();
  });
});
