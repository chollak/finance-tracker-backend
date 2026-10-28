import type { ApiError } from '@/shared/api';
import { groupDigits } from '@/shared/lib/money';
import { pluralRu } from '@/shared/lib/plural';
import { UNDO_WINDOW_MS, type UndoKind } from '@/shared/lib/undo';

/**
 * «Скачать все записи» (FT-126, boards «„Ещё“ — разделы и настройки», «Выгрузка записей»; SettingsList.md). In
 * Telegram the file comes to the chat with the bot, in a browser it is downloaded to the device. While the file is
 * made the row says so; once it is out, the toast says where and the row is blocked until the toast ends.
 */

export type ExportWay = 'chat' | 'download';

export type ExportPhase = 'idle' | 'pending' | 'done';

/** What the server says it sent: «kapelka-2026-10-14.csv», 205 records and moves. */
export interface ExportedFile {
  fileName: string;
  count: number;
}

export interface ExportToast {
  kind: UndoKind;
  title: string;
  detail: string;
}

/** The row stays blocked as long as the toast of a sent file shows. */
export const EXPORT_DONE_MS = UNDO_WINDOW_MS;

export function exportWay(inTelegram: boolean): ExportWay {
  return inTelegram ? 'chat' : 'download';
}

export function exportSubtitle(phase: ExportPhase, way: ExportWay): string {
  if (phase === 'pending') return 'Готовим файл…';
  if (phase === 'done') return way === 'chat' ? 'Отправлено — файл уже в чате с ботом' : 'Скачано — файл в загрузках';
  return way === 'chat' ? 'Файл CSV придёт в чат с ботом' : 'Файл CSV на это устройство';
}

export function exportedToast(file: ExportedFile, way: ExportWay): ExportToast {
  const records = `${groupDigits(String(file.count))} ${pluralRu(file.count, 'запись', 'записи', 'записей')}`;
  return {
    kind: 'saved',
    title: way === 'chat' ? 'Файл отправлен в чат с ботом' : 'Файл скачан',
    detail: `${file.fileName} · ${records}`,
  };
}

/** Nothing recorded yet: no empty file is made. */
export const NOTHING_TO_EXPORT: ExportToast = { kind: 'info', title: 'Выгружать пока нечего', detail: 'Записей ещё нет' };

export function exportFailedToast(error: unknown, way: ExportWay): ExportToast {
  const { statusCode, code } = (error ?? {}) as Partial<ApiError>;
  // The bot was blocked, or the chat with it never started
  if (code === 'BOT_CHAT_CLOSED') return { kind: 'info', title: 'Бот не может написать вам', detail: 'Откройте чат с ботом и нажмите «Старт»' };
  // Another screen or device sent it a moment ago
  if (statusCode === 409) return { kind: 'info', title: 'Файл уже в пути', detail: 'Он придёт в чат с ботом' };
  return {
    kind: 'info',
    title: way === 'chat' ? 'Не получилось отправить файл' : 'Не получилось скачать файл',
    detail: 'Проверьте связь и попробуйте ещё раз',
  };
}

/** `attachment; filename="kapelka-2026-10-14.csv"` → the name. */
export function fileNameFromDisposition(header: string | null): string | null {
  const match = header?.match(/filename="?([^";]+)"?/i);
  return match ? match[1] : null;
}
