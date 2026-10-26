/**
 * Undo stack of «Пастель» toasts (docs/pastel/components/Toast.md): every action shows for 4 seconds;
 * «Отменить» undoes the latest one, after which the previous one shows again if its own 4 seconds
 * have not run out. Pure functions — the store and the component only add timers and rendering.
 */
export type UndoKind = 'saved' | 'deleted' | 'changed' | 'info';

export interface UndoEntry {
  id: string;
  kind: UndoKind;
  /** What happened: «Записано», «Удалено», «Категория изменена». */
  title: string;
  /** What exactly: «Кофе · −25 000 сум · Карта». */
  detail?: string;
  /** Real undo. Without it the toast has no «Отменить» — never a decorative button. */
  undo?: () => void | Promise<void>;
  /**
   * The flow the action belongs to (the review of a phrase). When the flow ends, `dismissGroup` takes its
   * entries off the stack: their «Отменить» would undo something inside a flow that is already over.
   */
  group?: string;
  createdAt: number;
}

export const UNDO_WINDOW_MS = 4000;

export function isLive(entry: UndoEntry, now: number): boolean {
  return now - entry.createdAt < UNDO_WINDOW_MS;
}

export function pruneExpired(stack: UndoEntry[], now: number): UndoEntry[] {
  return stack.filter((entry) => isLive(entry, now));
}

export function visibleEntry(stack: UndoEntry[], now: number): UndoEntry | null {
  const live = pruneExpired(stack, now);
  return live.length > 0 ? live[live.length - 1] : null;
}

/** Remove the visible entry (to undo or dismiss it); expired ones go too. */
export function popVisible(stack: UndoEntry[], now: number): { entry: UndoEntry | null; rest: UndoEntry[] } {
  const live = pruneExpired(stack, now);
  if (live.length === 0) return { entry: null, rest: [] };
  return { entry: live[live.length - 1], rest: live.slice(0, -1) };
}

/** Milliseconds until the visible entry expires, so the UI can refresh exactly then. */
export function msUntilChange(stack: UndoEntry[], now: number): number | null {
  const entry = visibleEntry(stack, now);
  return entry ? Math.max(0, entry.createdAt + UNDO_WINDOW_MS - now) : null;
}
