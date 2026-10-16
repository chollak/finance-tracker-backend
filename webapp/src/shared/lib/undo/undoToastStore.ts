import { create } from 'zustand';
import { popVisible, pruneExpired, type UndoEntry } from './undoStack';

type NewEntry = Omit<UndoEntry, 'id' | 'createdAt'>;

interface UndoToastState {
  stack: UndoEntry[];
  /** Open sheets; while any is open the toast is hidden (it would sit on top of the sheet). */
  openSheets: number;
  push: (entry: NewEntry) => string;
  /** Undo the visible action; resolves after its undo ran. */
  undoVisible: () => Promise<void>;
  sheetOpened: () => void;
  sheetClosed: () => void;
  clear: () => void;
}

let counter = 0;

export const useUndoToastStore = create<UndoToastState>()((set, get) => ({
  stack: [],
  openSheets: 0,
  push: (entry) => {
    const id = `undo-${Date.now()}-${(counter += 1)}`;
    const now = Date.now();
    set((state) => ({ stack: [...pruneExpired(state.stack, now), { ...entry, id, createdAt: now }] }));
    return id;
  },
  undoVisible: async () => {
    const { entry, rest } = popVisible(get().stack, Date.now());
    set({ stack: rest });
    if (!entry?.undo) return;
    try {
      await entry.undo();
    } catch {
      get().push({ kind: 'info', title: 'Не получилось отменить', detail: 'Проверьте связь и попробуйте ещё раз' });
    }
  },
  sheetOpened: () => set((state) => ({ openSheets: state.openSheets + 1 })),
  sheetClosed: () => set((state) => ({ openSheets: Math.max(0, state.openSheets - 1) })),
  clear: () => set({ stack: [] }),
}));

/** Show an action toast. Pass `undo` only when it really reverts the action. */
export function showUndoToast(entry: NewEntry): string {
  return useUndoToastStore.getState().push(entry);
}
