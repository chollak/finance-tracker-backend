import type { Transaction } from '@/shared/types';
import { dayGroupLabel, toLocalDate, type LocalDate } from '@/shared/lib/dates';
import { formatMinor, type Currency } from '@/shared/lib/money';
import { isPastelColor, type PastelColor } from '@/shared/lib/pastel/categoryColors';
import { formatNetMinor, netInUzs } from './historySearch';

/** What a row shows of the record's category: its current name and pastel colour. */
export interface RecordCategory {
  name: string;
  color: PastelColor;
}

export interface RecordRow {
  id: string;
  /** The category's name; in a category's list (analytics, FT-121) the note, else the category's name. */
  title: string;
  /** The category's name, for its circle. */
  category: string;
  color: PastelColor;
  /**
   * The note, else the merchant, else «Без заметки»; in History followed by the account: «Супермаркет · Карта». In a
   * category's list the account, after the record's own category when it is another: «Транспорт · Карта».
   */
  note: string;
  /** «−186 400», «+12 500 000», «+300,00 USD»: сум without a unit, other currencies with one. */
  amount: string;
  /** Income is green with «+», expenses ink with «−». */
  tone: 'income' | 'expense';
  /**
   * «Продукты, −186 400 сум, Супермаркет. Открыть»; in History the account after the note; on the account screen
   * «… Открыть в истории» (FT-118).
   */
  ariaLabel: string;
  /** The category circle (FT-115): «Сменить категорию: Продукты, −186 400 сум». */
  categoryAriaLabel: string;
}

/** History's total of a day (TransactionList.md): in сум with its sign; income green, expenses muted. */
export interface DayTotal {
  /** «−210 400 сум», «≈ +16 118 000 сум». */
  text: string;
  tone: 'income' | 'muted';
}

export interface RecordDay {
  day: LocalDate;
  /** «Сегодня», «Вчера», «Понедельник, 12 октября»; History: «Сегодня, 14 октября». */
  label: string;
  rows: RecordRow[];
  /** History only, and only when it is known: not for dollars without a rate, nor for a day the next page goes on. */
  total?: DayTotal;
}

export interface RecordDaysOptions {
  today: LocalDate;
  categoryOf: (record: Transaction) => RecordCategory | undefined;
  /** History: the account's name after the note (board «История»). */
  accountOf?: (record: Transaction) => string | undefined;
  /** History: «Сегодня, 14 октября» instead of «Сегодня». */
  datedLabels?: boolean;
  /**
   * History: each day's total in сум, dollars at `rateMinor`. `lastDayComplete: false` while the next page is not
   * read — the last day may go on there, so its total waits.
   */
  dayTotals?: { rateMinor: number | null; lastDayComplete: boolean };
  /**
   * The operations of one category (analytics, FT-121, board «Аналитика · категория «Кафе»»): the category is the
   * screen's, so the note leads and the account goes under it; a record of another category — the one just moved out
   * of it, kept in the list — names it there and is left out of its day's total.
   */
  lead?: { categoryId: string };
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
 * One record's row (docs/pastel/components/TransactionList.md): its category's current name and colour (from the
 * user's list by id, else what the record was sent with), the note (in History followed by the account), the amount —
 * сум without a unit, other currencies with one; income green with «+». The account screen (FT-118) lays these rows
 * among its moves; there a row opens the record in History, and its label says so (`opens: 'history'`).
 */
export function recordRow(
  record: Transaction,
  options: Pick<RecordDaysOptions, 'categoryOf' | 'accountOf' | 'lead'> & { opens?: 'here' | 'history' }
): RecordRow {
  const category = options.categoryOf(record);
  const categoryName = category?.name ?? record.category;
  const color = category?.color ?? (isPastelColor(record.categoryColor) ? record.categoryColor : 'mist');
  const note = record.description?.trim() || record.merchant?.trim() || '';
  const account = options.accountOf?.(record);
  const currency: Currency = record.currency ?? 'UZS';
  const tone = record.type === 'income' ? 'income' : 'expense';
  const signed = tone === 'income' ? amountMinorOf(record) : -amountMinorOf(record);
  const fullAmount = formatMinor(signed, currency, { sign: 'always' });
  const opens = options.opens === 'history' ? 'Открыть в истории' : 'Открыть';

  // A category's list: «Обед с командой» over «Карта»
  const lead = options.lead;
  const title = lead ? note || categoryName : categoryName;
  const other = lead && record.categoryId !== lead.categoryId ? categoryName : '';
  const under = lead ? [other, account].filter(Boolean).join(' · ') : [note, account].filter(Boolean).join(' · ');
  const said = lead ? [other, account] : [note, account];

  return {
    id: record.id ?? '',
    title,
    category: categoryName,
    color,
    note: under || (lead ? '' : NO_NOTE),
    amount: formatMinor(signed, currency, { sign: 'always', unit: currency !== 'UZS' }),
    tone,
    ariaLabel: `${[title, fullAmount, ...said.filter(Boolean)].join(', ')}. ${opens}`,
    categoryAriaLabel: `Сменить категорию: ${categoryName}, ${fullAmount}`,
  };
}

/**
 * Rows of a list grouped by day (docs/pastel/components/TransactionList.md), in the order the records came
 * (newest first from the API). The category comes from the user's list by id (`categoryOf`); a record
 * whose category is not there keeps the name and colour it was sent with. History adds the account to the note,
 * the date to «Сегодня» and «Вчера», and each day's total.
 */
export function buildRecordDays(records: readonly Transaction[], options: RecordDaysOptions): RecordDay[] {
  const days: RecordDay[] = [];
  const recordsOfDay = new Map<LocalDate, Transaction[]>();

  for (const record of records) {
    const day = recordDay(record.date);
    let group = days.find((item) => item.day === day);
    if (!group) {
      group = { day, label: dayGroupLabel(day, options.today, { withDate: options.datedLabels }), rows: [] };
      days.push(group);
      recordsOfDay.set(day, []);
    }
    recordsOfDay.get(day)!.push(record);

    group.rows.push(recordRow(record, options));
  }

  const totals = options.dayTotals;
  if (totals) {
    days.forEach((group, index) => {
      if (index === days.length - 1 && !totals.lastDayComplete) return;
      const ofDay = recordsOfDay.get(group.day)!;
      const lead = options.lead;
      const counted = lead ? ofDay.filter((record) => record.categoryId === lead.categoryId) : ofDay;
      const net = netInUzs(counted, totals.rateMinor);
      const text = formatNetMinor(net);
      if (text) group.total = { text, tone: net.netMinor > 0 ? 'income' : 'muted' };
    });
  }

  return days;
}
