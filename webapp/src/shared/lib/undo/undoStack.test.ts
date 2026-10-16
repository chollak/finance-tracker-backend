import { describe, expect, it } from 'vitest';
import { msUntilChange, popVisible, pruneExpired, UNDO_WINDOW_MS, visibleEntry, type UndoEntry } from './undoStack';

const entry = (id: string, createdAt: number): UndoEntry => ({ id, kind: 'saved', title: 'Записано', createdAt });

describe('undo stack', () => {
  it('shows the latest action for 4 seconds', () => {
    const stack = [entry('a', 0), entry('b', 1000)];
    expect(visibleEntry(stack, 1500)?.id).toBe('b');
    expect(visibleEntry(stack, 1000 + UNDO_WINDOW_MS)?.id).toBeUndefined();
  });

  it('undoes from the latest, then shows the previous one while its time lasts', () => {
    const stack = [entry('a', 0), entry('b', 1000)];
    const first = popVisible(stack, 2000);
    expect(first.entry?.id).toBe('b');
    expect(visibleEntry(first.rest, 2000)?.id).toBe('a');

    const later = popVisible(stack, 3000);
    expect(visibleEntry(later.rest, 4500)).toBeNull(); // a expired at 4000
  });

  it('drops expired entries and has nothing to undo after them', () => {
    const stack = [entry('a', 0)];
    expect(pruneExpired(stack, 5000)).toEqual([]);
    expect(popVisible(stack, 5000)).toEqual({ entry: null, rest: [] });
  });

  it('says when the visible toast will change', () => {
    expect(msUntilChange([entry('a', 0)], 1500)).toBe(2500);
    expect(msUntilChange([], 0)).toBeNull();
  });
});
