import { Account } from '../../account/domain/account';
import { AccountMove, MoveKind } from '../../account/domain/accountMove';
import { Transaction } from '../../transaction/domain/transactionEntity';

/**
 * «Скачать все записи» (FT-126, board «„Ещё“ — разделы и настройки»: «Все записи с категориями, счетами и курсом —
 * таблицей CSV, её откроет Excel или Google Таблицы»).
 *
 * One line per record; a transfer or an exchange takes two — the money leaving one account and arriving on the
 * other — so summing «Сумма» by account gives what happened to each balance. The file is written for Excel and
 * Google Sheets in Russian: «;» between columns, a decimal comma, UTF-8 with a byte order mark, CRLF.
 */

export const EXPORT_COLUMNS = ['Дата', 'Тип', 'Сумма', 'Валюта', 'Счёт', 'Категория', 'Заметка', 'Курс'] as const;

const SEPARATOR = ';';
const LINE_END = '\r\n';
const BYTE_ORDER_MARK = '﻿';

const MOVE_TYPE: Record<MoveKind, string> = { transfer: 'Перевод', exchange: 'Обмен', adjustment: 'Корректировка' };

export function exportFileName(date: string): string {
  return `kapelka-${date}.csv`;
}

interface Line {
  day: string;
  /** Orders a day's lines by when they were written; ISO moments compare as text. */
  writtenAt: string;
  cells: string[];
}

/** Minor units as a spreadsheet number: «-24000», «12,50», «-3,05». */
function decimal(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const absolute = Math.abs(minor);
  const whole = Math.floor(absolute / 100);
  const cents = absolute % 100;
  return cents === 0 ? `${sign}${whole}` : `${sign}${whole},${String(cents).padStart(2, '0')}`;
}

/**
 * A text cell. A value that starts like a formula is kept as text with a leading apostrophe (a note «=HYPERLINK…»
 * must not run when the file is opened); one with «;», quotes or a line break goes in quotes.
 */
function text(value: string | null | undefined): string {
  let cell = value ?? '';
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  return /[;"\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** Records written before FT-100 may keep a full moment in `date`; they belong to its day, as in History. */
const dayOf = (stored: string) => stored.slice(0, 10);

export function buildRecordsCsv(input: {
  records: readonly Transaction[];
  moves: readonly AccountMove[];
  accounts: readonly Account[];
}): { text: string; count: number } {
  const accounts = new Map(input.accounts.map(account => [account.id, account]));
  const accountName = (id: string | null | undefined) => (id ? accounts.get(id)?.name ?? '' : '');
  const currencyOf = (id: string | null | undefined) => (id ? accounts.get(id)?.currency ?? 'UZS' : 'UZS');

  const lines: Line[] = [];

  for (const record of input.records) {
    const amountMinor = record.amountMinor ?? Math.round(record.amount * 100);
    lines.push({
      day: dayOf(record.date),
      writtenAt: record.createdAt ?? '',
      cells: [
        dayOf(record.date),
        record.type === 'income' ? 'Доход' : 'Расход',
        decimal(record.type === 'income' ? amountMinor : -amountMinor),
        record.currency ?? 'UZS',
        text(accountName(record.accountId)),
        text(record.category),
        text(record.description),
        '',
      ],
    });
  }

  for (const move of input.moves) {
    const writtenAt = move.createdAt.toISOString();
    const rate = move.kind === 'exchange' && move.dealRateMinor !== null ? decimal(move.dealRateMinor) : '';
    const line = (accountId: string, amountMinor: number): Line => ({
      day: move.date,
      writtenAt,
      cells: [move.date, MOVE_TYPE[move.kind], decimal(amountMinor), currencyOf(accountId), text(accountName(accountId)), '', text(move.note), rate],
    });
    // Leaving first, then arriving; an adjustment only changes its own account
    if (move.fromAccountId) lines.push(line(move.fromAccountId, -(move.fromAmountMinor ?? 0)));
    lines.push(line(move.toAccountId, move.toAmountMinor));
  }

  // Oldest first, as a ledger reads; the sort is stable, so a move's two lines stay together and in order
  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  lines.sort((a, b) => order(a.day, b.day) || order(a.writtenAt, b.writtenAt));

  const body = [EXPORT_COLUMNS.join(SEPARATOR), ...lines.map(line => line.cells.join(SEPARATOR))];
  return {
    text: BYTE_ORDER_MARK + body.map(line => line + LINE_END).join(''),
    count: input.records.length + input.moves.length,
  };
}
