import type { Transaction } from '@/shared/types';
import { dayGroupLabel, toLocalDate, type LocalDate } from '@/shared/lib/dates';
import { formatMinor, type Currency } from '@/shared/lib/money';
import { isPastelColor, type PastelColor } from '@/shared/lib/pastel/categoryColors';

/** What a row shows of the record's category: its current name and pastel colour. */
export interface RecordCategory {
  name: string;
  color: PastelColor;
}

export interface RecordRow {
  id: string;
  /** The category's name. */
  title: string;
  color: PastelColor;
  /** The note, else the merchant, else «Без заметки». */
  note: string;
  /** «−186 400», «+12 500 000», «+300,00 USD»: сум without a unit, other currencies with one. */
  amount: string;
  /** Income is green with «+», expenses ink with «−». */
  tone: 'income' | 'expense';
  /** «Продукты, −186 400 сум, Супермаркет. Открыть». */
  ariaLabel: string;
  /** The category circle (FT-115): «Сменить категорию: Продукты, −186 400 сум». */
  categoryAriaLabel: string;
}

export interface RecordDay {
  day: LocalDate;
  /** «Сегодня», «Вчера», «Понедельник, 12 октября». */
  label: string;
  rows: RecordRow[];
}

const NO_NOTE = 'Без заметки';

/** The local day of a record: a plain date as is; records saved before FT-100 may keep a full moment. */
function recordDay(date: string): LocalDate {
  if (!date.includes('T')) return date.slice(0, 10);
  const moment = new Date(date);
  return Number.isNaN(moment.getTime()) ? date.slice(0, 10) : toLocalDate(moment);
}

function amountMinorOf(record: Transaction): number {
  return record.amountMinor ?? Math.round(record.amount * 100);
}

/**
 * Rows of a list grouped by day (docs/pastel/components/TransactionList.md), in the order the records came
 * (newest first from the API). The category comes from the user's list by id (`categoryOf`); a record
 * whose category is not there keeps the name and colour it was sent with.
 */
export function buildRecordDays(
  records: readonly Transaction[],
  options: { today: LocalDate; categoryOf: (record: Transaction) => RecordCategory | undefined }
): RecordDay[] {
  const days: RecordDay[] = [];

  for (const record of records) {
    const day = recordDay(record.date);
    let group = days.find((item) => item.day === day);
    if (!group) {
      group = { day, label: dayGroupLabel(day, options.today), rows: [] };
      days.push(group);
    }

    const category = options.categoryOf(record);
    const title = category?.name ?? record.category;
    const color = category?.color ?? (isPastelColor(record.categoryColor) ? record.categoryColor : 'mist');
    const note = record.description?.trim() || record.merchant?.trim() || '';
    const currency: Currency = record.currency ?? 'UZS';
    const tone = record.type === 'income' ? 'income' : 'expense';
    const signed = tone === 'income' ? amountMinorOf(record) : -amountMinorOf(record);

    const fullAmount = formatMinor(signed, currency, { sign: 'always' });
    group.rows.push({
      id: record.id ?? '',
      title,
      color,
      note: note || NO_NOTE,
      amount: formatMinor(signed, currency, { sign: 'always', unit: currency !== 'UZS' }),
      tone,
      ariaLabel: `${title}, ${fullAmount}${note ? `, ${note}` : ''}. Открыть`,
      categoryAriaLabel: `Сменить категорию: ${title}, ${fullAmount}`,
    });
  }

  return days;
}
