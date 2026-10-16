import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUndoToastStore, showUndoToast } from './undoToastStore';
import { visibleEntry } from './undoStack';

const state = () => useUndoToastStore.getState();

describe('undo toast store', () => {
  afterEach(() => {
    state().clear();
    while (state().openSheets > 0) state().sheetClosed();
    vi.useRealTimers();
  });

  it('undoes the visible action once and shows the previous one', async () => {
    const first = vi.fn();
    const second = vi.fn();
    showUndoToast({ kind: 'saved', title: 'Записано', undo: first });
    const id = showUndoToast({ kind: 'deleted', title: 'Удалено', undo: second });

    await state().undoVisible(id);
    await state().undoVisible(id); // a double tap does not undo the previous action

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(visibleEntry(state().stack, Date.now())?.title).toBe('Записано');
  });

  it('puts a failed undo back so it can be retried', async () => {
    const undo = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    const id = showUndoToast({ kind: 'saved', title: 'Записано', undo });

    await state().undoVisible(id);
    const retry = visibleEntry(state().stack, Date.now());
    expect(retry?.title).toBe('Не получилось отменить');
    expect(retry?.undo).toBe(undo);

    await state().undoVisible(retry!.id);
    expect(undo).toHaveBeenCalledTimes(2);
    expect(visibleEntry(state().stack, Date.now())).toBeNull();
  });

  it('counts open sheets and never goes below zero', () => {
    state().sheetOpened();
    state().sheetOpened();
    state().sheetClosed();
    expect(state().openSheets).toBe(1);
    state().sheetClosed();
    state().sheetClosed();
    expect(state().openSheets).toBe(0);
  });
});
