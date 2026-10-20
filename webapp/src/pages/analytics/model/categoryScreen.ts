import type { AnalyticsDay, CategoryAnalytics } from '@/entities/analytics';
import type { Transaction } from '@/shared/types';
import { dayMonth, monthNameOf } from '@/shared/lib/dates';
import { formatMinor, NBSP, usdToUzsMinor, type Currency } from '@/shared/lib/money';
import { arrow, capitalize, diffWords, monthIn, periodWords, plural, som, typeGenitive } from './periodWords';

/**
 * One category of a month (FT-121, board «Аналитика · категория «Кафе»», DayBars.md): the words and shapes from
 * `GET /api/analytics/categories/:id` (FT-120). The insight about the category is built here from its operations,
 * as the board does (api.md: «Вывод про саму категорию экран строит из `records`»).
 */

export interface CategorySummary {
  /** «1 092 000», «≈ 3 795 000»; «сум» goes beside it. */
  amount: string;
  /** Income is green. */
  tone: 'income' | 'ink';
  /** «14% расходов · 10 операций · в среднем 109 200 сум». */
  meta: string;
  /** «↑ 40% к 1–14 сентября · на 312 000 сум больше»; null without a comparison. */
  compare: string | null;
  insight: string | null;
}

const approx = (hasUsd: boolean, text: string) => (hasUsd ? `≈${NBSP}${text}` : text);
const operations = (count: number) => `${count} ${plural(count, 'операция', 'операции', 'операций')}`;

/** «1–14 октября», «сентябрь» — beside the category's name. */
export function categoryPeriodLabel(data: CategoryAnalytics): string {
  return periodWords(data).label;
}

function compareLine(data: CategoryAnalytics): string | null {
  const previous = periodWords(data).previous;
  const change = data.change;
  if (!data.comparable || !previous || !change) return null;
  switch (change.kind) {
    // Income of a month not over: against the whole month before, never a «fall»
    case 'so_far':
    case 'not_yet':
      return `За ${previous.whole} — ${som(data.previousMinor ?? 0)}`;
    case 'new':
      return `${capitalize(previous.in)} не было`;
    case 'same':
      return `Столько же, ${previous.like}`;
    case 'up':
    case 'down':
      return `${arrow(change.kind, change.percent ?? 0)} ${previous.to} · ${diffWords(change.diffMinor)}`;
  }
}

export function categorySummary(data: CategoryAnalytics): CategorySummary {
  const { count } = data;
  const parts = [`${data.sharePercent}% ${typeGenitive(data.category.type)}`, operations(count)];
  if (count > 1) parts.push(`в среднем ${som(Math.round(data.amountMinor / count))}`);
  return {
    amount: approx(data.hasUsd, formatMinor(data.amountMinor, 'UZS', { unit: false })),
    tone: data.category.type === 'income' ? 'income' : 'ink',
    meta: parts.join(' · '),
    compare: compareLine(data),
    insight: categoryInsight(data),
  };
}

interface Valued {
  record: Transaction;
  /** In сум at the answer's rate. */
  minor: number;
  note: string;
}

const ownMinor = (record: Transaction) => record.amountMinor ?? Math.round(record.amount * 100);
const recordDay = (record: Transaction) => record.date.slice(0, 10);
/** «Ужин» and «ужин » are one note. */
const noteKey = (note: string) => note.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ');

/** The operations that counted in the sum: dollars at the answer's rate, those without a rate left out. */
function valued(data: CategoryAnalytics): Valued[] {
  const rate = data.usd.rateMinor;
  return data.records.flatMap((record) => {
    const minor = record.currency === 'USD' ? (rate ? usdToUzsMinor(ownMinor(record), rate) : null) : ownMinor(record);
    return minor === null ? [] : [{ record, minor, note: (record.description || record.merchant || '').trim() }];
  });
}

/**
 * The line under the category's total (board `renderVals`, «category view»): in the first days — no conclusions yet;
 * one operation — its day; two largest making almost half or more — both by name; a note repeated from 3 times —
 * the most frequent; otherwise the largest one, in its own currency.
 */
export function categoryInsight(data: CategoryAnalytics): string | null {
  const items = valued(data);
  if (items.length === 0) return null;
  if (data.firstDays) return 'Выводы появятся через неделю записей';
  if (items.length === 1) return `Одна операция — ${dayMonth(recordDay(items[0].record))}`;

  const total = items.reduce((sum, item) => sum + item.minor, 0);
  // Stable: of two equal sums the newer stays first, as the API lists them
  const [first, second] = [...items].sort((a, b) => b.minor - a.minor);
  const pair = total > 0 ? (first.minor + second.minor) / total : 0;
  if (items.length >= 3 && pair >= 0.45 && first.note && second.note) {
    const lead = pair >= 0.5 ? 'Больше половины' : 'Почти половина';
    return noteKey(first.note) === noteKey(second.note) ? `${lead} — две траты «${first.note}»` : `${lead} — «${first.note}» и «${second.note}»`;
  }

  const counts = new Map<string, { note: string; count: number }>();
  for (const item of items) {
    if (!item.note) continue;
    const key = noteKey(item.note);
    const known = counts.get(key);
    if (known) known.count += 1;
    else counts.set(key, { note: item.note, count: 1 });
  }
  const [often, next] = [...counts.values()].sort((a, b) => b.count - a.count);
  if (often && often.count >= 3 && (!next || next.count < often.count)) {
    return `Чаще всего — «${often.note}»: ${often.count} ${plural(often.count, 'раз', 'раза', 'раз')}`;
  }

  const currency: Currency = first.record.currency ?? 'UZS';
  const amount = formatMinor(ownMinor(first.record), currency);
  return first.note ? `Крупнейшая — «${first.note}»: ${amount}` : `Крупнейшая — ${amount}, ${dayMonth(recordDay(first.record))}`;
}

/** A column of DayBars.md. */
export interface DayColumn {
  date: string;
  /** Up to 100px: the largest day; a day with something is at least 3px. */
  heightPx: number;
  /** The axis: the 1st, every 7th and the last day; around a chosen day only its own. */
  label: string | null;
  selected: boolean;
  /** Another day is chosen: `chart-dim`. */
  dim: boolean;
}

export interface DayChart {
  columns: DayColumn[];
  /** More than 16 days: 6px bars, else 14px. */
  narrow: boolean;
  ariaLabel: string;
  readout: { top: string; value: string | null };
  /** The chosen day is the first or the last: the arrow there is `aria-disabled`. */
  atFirst: boolean;
  atLast: boolean;
  /** The day with the most: Enter chooses it. */
  largest: string | null;
}

/**
 * The days the bars show: a past month all of them, the current one up to today — or up to a record dated later
 * this month, which counts in the sum too.
 */
export function chartDays(data: CategoryAnalytics): AnalyticsDay[] {
  if (data.period.wholeMonth) return data.days;
  const today = data.month === data.today.slice(0, 7) ? Number(data.today.slice(8, 10)) : data.days.length;
  const lastWithRecords = data.days.reduce((last, day, index) => (day.count > 0 ? index + 1 : last), 0);
  return data.days.slice(0, Math.max(today, lastWithRecords));
}

/** «5 октября»: the chip over the operations and the readout under the bars. */
export function dayChip(date: string): string {
  return `${Number(date.slice(8, 10))}${NBSP}${monthNameOf(Number(date.slice(5, 7)))}`;
}

/** Spending by day; none for fewer than 2 operations (DayBars.md). */
export function dayChart(data: CategoryAnalytics, selected: string | null): DayChart | null {
  if (data.count < 2) return null;
  const days = chartDays(data);
  const count = days.length;
  const narrow = count > 16;
  const max = days.reduce((top, day) => Math.max(top, day.amountMinor), 0);
  const largest = max > 0 ? days.find((day) => day.amountMinor === max) ?? null : null;
  const chosen = selected ? days.findIndex((day) => day.date === selected) : -1;

  const columns = days.map((day, index): DayColumn => {
    const number = index + 1;
    const marked = number === 1 || number === count || (narrow ? number % 7 === 1 && number < count - 3 : number % 7 === 0 && number < count - 1);
    let label = marked ? String(number) : null;
    if (chosen >= 0 && index === chosen) label = String(number);
    else if (chosen >= 0 && Math.abs(index - chosen) <= 2) label = null;
    return {
      date: day.date,
      heightPx: max > 0 && day.amountMinor > 0 ? Math.max(3, Math.round((day.amountMinor / max) * 100)) : 0,
      label,
      selected: index === chosen,
      dim: chosen >= 0 && index !== chosen,
    };
  });

  const what = data.category.type === 'income' ? 'Поступления' : 'Траты';
  const most = largest ? `. Больше всего — ${dayMonth(largest.date)}: ${approx(largest.hasUsd, som(largest.amountMinor))}` : '';
  const day = chosen >= 0 ? days[chosen] : null;
  return {
    columns,
    narrow,
    ariaLabel: `${what} по дням, ${periodWords(data).label}${most}. Выбрать день`,
    readout: day
      ? { top: dayChip(day.date), value: day.count > 0 ? `${approx(day.hasUsd, som(day.amountMinor))} · ${operations(day.count)}` : 'нет операций' }
      : { top: 'Коснитесь столбца или выберите день стрелками', value: null },
    atFirst: chosen === 0,
    atLast: chosen === count - 1,
    largest: largest?.date ?? null,
  };
}

/**
 * A touch on the bars chooses the nearest day (`fraction` — where across them), Enter (no position) the largest;
 * the same day again clears the choice.
 */
export function tapDay(dates: readonly string[], selected: string | null, fraction: number | null, largest: string | null): string | null {
  if (dates.length === 0) return null;
  const picked =
    fraction === null ? largest ?? dates[dates.length - 1] : dates[Math.min(dates.length - 1, Math.max(0, Math.floor(fraction * dates.length)))];
  return picked === selected ? null : picked;
}

/** ‹ and ›: a day back or forward, stopping at the edges; with none chosen, the last or the first day. */
export function stepDay(dates: readonly string[], selected: string | null, direction: -1 | 1): string {
  const index = selected ? dates.indexOf(selected) : -1;
  if (index < 0) return direction < 0 ? dates[dates.length - 1] : dates[0];
  return dates[Math.min(dates.length - 1, Math.max(0, index + direction))];
}

/** Under «Операции» when there are none. */
export function noOperationsText(data: CategoryAnalytics, selected: string | null): string {
  return selected ? 'В этот день операций нет' : `${capitalize(monthIn(data.month))} операций нет`;
}
