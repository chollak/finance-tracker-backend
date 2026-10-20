import { create } from 'zustand';
import { EXPORT_DONE_MS, type ExportPhase } from './exportRecords';

/**
 * One export at a time for the whole app (FT-126: «Повторное нажатие, пока идёт выгрузка, не шлёт второй файл»). Kept
 * outside the screen, so leaving «Ещё» and coming back while the file is made does not start a second one; the
 * server refuses a second one too.
 */
interface ExportState {
  running: boolean;
  /** When the last file went out; its toast shows for EXPORT_DONE_MS. */
  doneAt: number | null;
}

export const useExportStore = create<ExportState>()(() => ({ running: false, doneAt: null }));

export function exportPhase(state: ExportState, now: number): ExportPhase {
  if (state.running) return 'pending';
  if (state.doneAt !== null && now - state.doneAt < EXPORT_DONE_MS) return 'done';
  return 'idle';
}

/** Takes the export, or says no while one is made or its toast shows. Synchronous: a double tap gets one. */
export function beginExport(now: number): boolean {
  if (exportPhase(useExportStore.getState(), now) !== 'idle') return false;
  useExportStore.setState({ running: true, doneAt: null });
  return true;
}

/** `sent`: a file went out — the row is blocked while its toast shows; otherwise it is ready again at once. */
export function finishExport(sent: boolean, now: number): void {
  useExportStore.setState({ running: false, doneAt: sent ? now : null });
}
