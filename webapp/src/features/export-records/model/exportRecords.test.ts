import { afterEach, describe, expect, it } from 'vitest';
import { NBSP } from '@/shared/lib/money';
import {
  EXPORT_DONE_MS,
  exportedToast,
  exportFailedToast,
  exportSubtitle,
  fileNameFromDisposition,
  NOTHING_TO_EXPORT,
} from './exportRecords';
import { beginExport, exportPhase, finishExport, useExportStore } from './exportStore';

/**
 * FT-126, board «Выгрузка записей» (Pastel_More, view «export»): «Скачать все записи» says what it does, says it is done
 * while the toast shows, and a second press then does nothing (SettingsList.md: «Повторное действие, которое уже
 * выполнено, блокируется до конца Toast»).
 */

describe('what the row and the toast say', () => {
  it('the row: what will happen, while it is being made, and what happened — in the chat and on the device', () => {
    expect(exportSubtitle('idle', 'chat')).toBe('Файл CSV придёт в чат с ботом');
    expect(exportSubtitle('idle', 'download')).toBe('Файл CSV на это устройство');
    expect(exportSubtitle('pending', 'chat')).toBe('Готовим файл…');
    expect(exportSubtitle('done', 'chat')).toBe('Отправлено — файл уже в чате с ботом');
    expect(exportSubtitle('done', 'download')).toBe('Скачано — файл в загрузках');
  });

  it('the toast names the file and how many records it has, as on the board', () => {
    expect(exportedToast({ fileName: 'kapelka-2026-10-14.csv', count: 205 }, 'chat')).toEqual({
      kind: 'saved',
      title: 'Файл отправлен в чат с ботом',
      detail: 'kapelka-2026-10-14.csv · 205 записей',
    });
    expect(exportedToast({ fileName: 'kapelka-2026-10-14.csv', count: 1 }, 'download')).toEqual({
      kind: 'saved',
      title: 'Файл скачан',
      detail: 'kapelka-2026-10-14.csv · 1 запись',
    });
    expect(NOTHING_TO_EXPORT).toEqual({ kind: 'info', title: 'Выгружать пока нечего', detail: 'Записей ещё нет' });
  });

  it('a failure says what to do: the chat the bot may not write to, a file already on its way, no connection', () => {
    expect(exportFailedToast({ statusCode: 422, code: 'BOT_CHAT_CLOSED', message: '' }, 'chat')).toEqual({
      kind: 'info',
      title: 'Бот не может написать вам',
      detail: 'Откройте чат с ботом и нажмите «Старт»',
    });
    expect(exportFailedToast({ statusCode: 409, code: 'CONFLICT', message: '' }, 'chat')).toEqual({
      kind: 'info',
      title: 'Файл уже в пути',
      detail: 'Он придёт в чат с ботом',
    });
    expect(exportFailedToast({ statusCode: 0, message: 'Network error' }, 'chat')).toEqual({
      kind: 'info',
      title: 'Не получилось отправить файл',
      detail: 'Проверьте связь и попробуйте ещё раз',
    });
    expect(exportFailedToast(new Error('boom'), 'download')).toEqual({
      kind: 'info',
      title: 'Не получилось скачать файл',
      detail: 'Проверьте связь и попробуйте ещё раз',
    });
  });

  it('reads the file name the server gave', () => {
    expect(fileNameFromDisposition('attachment; filename="kapelka-2026-10-14.csv"')).toBe('kapelka-2026-10-14.csv');
    expect(fileNameFromDisposition('attachment; filename=kapelka-2026-10-14.csv')).toBe('kapelka-2026-10-14.csv');
    expect(fileNameFromDisposition(null)).toBeNull();
  });

  it('counts with a non-breaking space only where the number is grouped', () => {
    expect(exportedToast({ fileName: 'f.csv', count: 12_345 }, 'chat').detail).toBe(`f.csv · 12${NBSP}345 записей`);
  });
});

describe('one export at a time', () => {
  afterEach(() => useExportStore.setState({ running: false, doneAt: null }));

  it('a press while the file is being made, or while its toast shows, starts nothing', () => {
    expect(beginExport(1_000)).toBe(true);
    expect(exportPhase(useExportStore.getState(), 1_000)).toBe('pending');
    expect(beginExport(1_001)).toBe(false);

    finishExport(true, 2_000);
    expect(exportPhase(useExportStore.getState(), 2_000)).toBe('done');
    expect(beginExport(2_000 + EXPORT_DONE_MS - 1)).toBe(false);

    // The toast is gone: the next press makes a new file
    expect(exportPhase(useExportStore.getState(), 2_000 + EXPORT_DONE_MS)).toBe('idle');
    expect(beginExport(2_000 + EXPORT_DONE_MS)).toBe(true);
  });

  it('after a failure or with nothing to export, the row is ready again at once', () => {
    beginExport(1_000);
    finishExport(false, 1_500);

    expect(exportPhase(useExportStore.getState(), 1_500)).toBe('idle');
    expect(beginExport(1_500)).toBe(true);
  });
});
