import { create } from 'zustand';
import { popVisible, pruneExpired, type UndoEntry } from './undoStack';

type NewEntry = Omit<UndoEntry, 'id' | 'createdAt'>;

interface UndoToastState {
  stack: UndoEntry[];
  /** The clock the toast is drawn against; moved by every action and by tick(). */
  now: number;
  /** Open sheets; while any is open the toast is hidden (it would sit on top of the sheet). */
  openSheets: number;
  push: (entry: NewEntry) => string;
  /** Undo the visible action (only if it is still the one with this id); resolves after its undo ran. */
  undoVisible: (id?: string) => Promise<void>;
  sheetOpened: () => void;
  sheetClosed: () => void;
  clear: () => void;
  tick: () => void;
}

let counter = 0;

export const useUndoToastStore = create<UndoToastState>()((set, get) => ({
  stack: [],
  now: Date.now(),
  openSheets: 0,
  push: (entry) => {
    const id = `undo-${Date.now()}-${(counter += 1)}`;
    const now = Date.now();
    set((state) => ({ stack: [...pruneExpired(state.stack, now), { ...entry, id, createdAt: now }], now }));
    return id;
  },
  undoVisible: async (id) => {
    const now = Date.now();
    const { entry, rest } = popVisible(get().stack, now);
    if (!entry || (id && entry.id !== id)) return;
    set({ stack: rest, now });
    if (!entry.undo) return;
    try {
      await entry.undo();
    } catch {
      // Put it back with the same undo, so «Отменить» really retries.
      get().push({ kind: entry.kind, title: 'Не получилось отменить', detail: 'Проверьте связь и нажмите ещё раз', undo: entry.undo });
    }
  },
  sheetOpened: () => set((state) => ({ openSheets: state.openSheets + 1 })),
  sheetClosed: () => set((state) => ({ openSheets: Math.max(0, state.openSheets - 1) })),
  clear: () => set({ stack: [] }),
  tick: () => set({ now: Date.now() }),
}));

/** Show an action toast. Pass `undo` only when it really reverts the action. */
export function showUndoToast(entry: NewEntry): string {
  return useUndoToastStore.getState().push(entry);
}
