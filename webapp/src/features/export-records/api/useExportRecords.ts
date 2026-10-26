import { useCallback, useEffect, useState } from 'react';
import { saveFile } from '@/shared/lib/files';
import { showUndoToast } from '@/shared/lib/undo';
import {
  EXPORT_DONE_MS,
  exportedToast,
  exportFailedToast,
  exportSubtitle,
  exportWay,
  NOTHING_TO_EXPORT,
  type ExportPhase,
  type ExportWay,
} from '../model/exportRecords';
import { beginExport, exportPhase, finishExport, useExportStore } from '../model/exportStore';
import { downloadRecords, sendRecordsToChat } from './exportApi';

export interface ExportRecords {
  phase: ExportPhase;
  /** The row's state: «Файл CSV придёт в чат с ботом», «Готовим файл…», «Отправлено — файл уже в чате с ботом». */
  subtitle: string;
  /** Makes the file; does nothing while one is made or while the toast of the last one shows. */
  start: () => void;
}

async function runExport(way: ExportWay): Promise<void> {
  if (!beginExport(Date.now())) return;
  let sent = false;
  try {
    if (way === 'chat') {
      const file = await sendRecordsToChat();
      if (file.count === 0) return void showUndoToast(NOTHING_TO_EXPORT);
      sent = true;
      showUndoToast(exportedToast(file, way));
    } else {
      const file = await downloadRecords();
      if (file.count === 0) return void showUndoToast(NOTHING_TO_EXPORT);
      saveFile(file.blob, file.fileName);
      sent = true;
      showUndoToast(exportedToast(file, way));
    }
  } catch (error) {
    showUndoToast(exportFailedToast(error, way));
  } finally {
    finishExport(sent, Date.now());
  }
}

/**
 * «Скачать все записи» (FT-126): in Telegram the file goes to the chat with the bot, in a browser to the device. The
 * toast says where; the row says «Готовим файл…» while it is made and is blocked while the toast shows.
 */
export function useExportRecords(inTelegram: boolean): ExportRecords {
  const way = exportWay(inTelegram);
  const running = useExportStore((state) => state.running);
  const doneAt = useExportStore((state) => state.doneAt);
  // The clock the row is drawn against: a file sent after it is still «done»; moved on when the toast ends
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (doneAt === null) return;
    const left = doneAt + EXPORT_DONE_MS - Date.now();
    if (left <= 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), left + 20);
    return () => window.clearTimeout(timer);
  }, [doneAt]);

  const phase = exportPhase({ running, doneAt }, now);
  const start = useCallback(() => void runExport(way), [way]);
  return { phase, subtitle: exportSubtitle(phase, way), start };
}
