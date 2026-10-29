import { Transaction } from './transactionEntity';
import { CategoryTotal, PeriodTotals, uzsMinorOf } from './periodTotals';

/**
 * Analytics «куда уходят деньги» (FT-120): the rules of design-system «Аналитика» over the period totals of
 * FT-103. Everything here is in сум minor units; dollars come converted at one rate by `summarizePeriod`.
 */
export type AnalyticsType = 'expense' | 'income';

export const ANALYTICS_RULES = {
  /** No insight and no comparison while the user has recorded for fewer days than this. */
  firstDays: 7,
  /** An expense category takes part in the insight from this many operations in both periods. */
  minOperations: 3,
} as const;

export interface AnalyticsPeriod {
  /** YYYY-MM */
  month: string;
  /** YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
  /**
   * A whole month: a month that is over, or the previous month compared in full. The current month is never
   * whole — it is «1–14 октября» even on its last day: its records are the whole calendar month (a record dated
   * after today counts, as on Home's tiles), compared with the days of the previous month up to today's.
   */
  wholeMonth: boolean;
}

/**
 * Against the previous period: «↑ 40%», «↓ 15%», «как было», «новое»; income of an unfinished month never falls —
 * «пока 60%» of the whole previous month, «пока нет».
 */
export interface AnalyticsChange {
  kind: 'up' | 'down' | 'same' | 'new' | 'so_far' | 'not_yet';
  /** Whole percent: the change for up/down/same, the share of the previous period for so_far/not_yet; null for new. */
  percent: number | null;
  /** This period minus the previous one. */
  diffMinor: number;
}

export interface AnalyticsCategoryRow {
  categoryId: string;
  /** The category's current name. */
  name: string;
  amountMinor: number;
  count: number;
  /** Whole percent of the period's total; the rows add up to exactly 100. */
  sharePercent: number;
  /** Converted dollars are inside: «≈». */
  hasUsd: boolean;
  /** The previous period; null when there is no comparison. */
  previousMinor: number | null;
  previousCount: number | null;
  change: AnalyticsChange | null;
}

/** The one line under the total. */
export type AnalyticsInsight =
  /** «Кафе: на 312 000 сум больше, чем за 1–14 сентября» */
  | { kind: 'change'; categoryId: string; name: string; direction: 'up' | 'down'; diffMinor: number; amountMinor: number; previousMinor: number }
  /** «Подарки: 500 000 сум — в сентябре не было» */
  | { kind: 'new'; categoryId: string; name: string; amountMinor: number }
  /** «Больше всего — продукты: 29% расходов» */
  | { kind: 'largest'; categoryId: string; name: string; sharePercent: number }
  /** «Пока записи за 3 дня — выводы через 4 дня» */
  | { kind: 'too_early'; days: number; daysLeft: number };

export interface MonthAnalyticsBody {
  /** There is a previous period with something in it, and the first days of recording are over. */
  comparable: boolean;
  totalMinor: number;
  hasUsd: boolean;
  previousTotalMinor: number | null;
  change: AnalyticsChange | null;
  categories: AnalyticsCategoryRow[];
  insight: AnalyticsInsight | null;
}

export interface AnalyticsDay {
  /** YYYY-MM-DD */
  date: string;
  amountMinor: number;
  count: number;
  hasUsd: boolean;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const pad = (value: number) => String(value).padStart(2, '0');

/** Whether the value is a month written as YYYY-MM. */
export function isValidMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH.test(value);
}

export function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const index = year * 12 + monthNumber - 1 + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

/** The day a record belongs to; records saved before FT-100 may keep a full moment and count on its own day. */
export function recordDay(record: Pick<Transaction, 'date'>): string {
  return record.date.slice(0, 10);
}

export function isInPeriod(record: Pick<Transaction, 'date'>, period: Pick<AnalyticsPeriod, 'from' | 'to'>): boolean {
  const day = recordDay(record);
  return day >= period.from && day <= period.to;
}

const dayNumber = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86400000;

/** Days of recording, the first record's day and today included; 0 before the first record. */
export function trackingDaysOf(firstRecordDate: string | null, today: string): number {
  if (!firstRecordDate) return 0;
  return Math.max(0, dayNumber(today) - dayNumber(firstRecordDate) + 1);
}

/** The first days of recording: no comparison and no insight yet («Пока записи за 3 дня — выводы через 4 дня»). */
export interface AnalyticsFirstDays {
  days: number;
  daysLeft: number;
}

/** The first days while they last, else null (the 7th day of recording ends them). */
export function firstDaysOf(trackingDays: number): AnalyticsFirstDays | null {
  if (trackingDays >= ANALYTICS_RULES.firstDays) return null;
  return { days: trackingDays, daysLeft: ANALYTICS_RULES.firstDays - trackingDays };
}

/**
 * The month and what it is compared with: the current month against the same days of the previous month, up to
 * today's («1–14 октября» against «1–14 сентября»), a past month and income of the current month against the whole
 * previous month. The current month's records are the whole calendar month, as on Home's tiles (FT-141): a record
 * dated later this month counts in it — unless `throughToday`: the bot's summary of a day tells the month up to that
 * day, so «Итоги за вчера» sent the next morning leave out what was recorded since (FT-164). Nothing before the first
 * month of recording.
 */
export function analyticsPeriods(input: { month: string; today: string; type: AnalyticsType; firstMonth: string; throughToday?: boolean }): {
  period: AnalyticsPeriod;
  previous: AnalyticsPeriod | null;
} {
  const { month, today, type, firstMonth } = input;
  const ongoing = month === today.slice(0, 7);
  const to = ongoing && input.throughToday ? today : `${month}-${pad(daysInMonth(month))}`;
  const period: AnalyticsPeriod = { month, from: `${month}-01`, to, wholeMonth: !ongoing };

  const previousMonth = shiftMonth(month, -1);
  if (previousMonth < firstMonth) return { period, previous: null };
  const previousDays = daysInMonth(previousMonth);
  const previousTo = ongoing && type === 'expense' ? Math.min(Number(today.slice(8, 10)), previousDays) : previousDays;
  return {
    period,
    previous: {
      month: previousMonth,
      from: `${previousMonth}-01`,
      to: `${previousMonth}-${pad(previousTo)}`,
      wholeMonth: previousTo === previousDays,
    },
  };
}

/** Whole percents of the total that add up to exactly 100 (largest remainders get the points left). */
export function sharesOf(amounts: number[]): number[] {
  const total = amounts.reduce((sum, amount) => sum + Math.max(0, amount), 0);
  if (total <= 0) return amounts.map(() => 0);
  const big = BigInt(total);
  const parts = amounts.map((amount, index) => {
    const scaled = BigInt(Math.max(0, amount)) * BigInt(100);
    return { index, amount, share: Number(scaled / big), remainder: scaled % big };
  });
  let left = 100 - parts.reduce((sum, part) => sum + part.share, 0);
  const order = parts
    .filter(part => part.amount > 0)
    .sort((a, b) => (a.remainder === b.remainder ? 0 : a.remainder > b.remainder ? -1 : 1) || b.amount - a.amount || a.index - b.index);
  for (const part of order) {
    if (left <= 0) break;
    part.share += 1;
    left -= 1;
  }
  return parts.map(part => part.share);
}

/** The change against the previous period; `soFar` — income of an unfinished month, which never «falls». */
export function changeOf(currentMinor: number, previousMinor: number, options: { soFar?: boolean } = {}): AnalyticsChange {
  const diffMinor = currentMinor - previousMinor;
  if (options.soFar && previousMinor > 0 && currentMinor < previousMinor) {
    if (currentMinor <= 0) return { kind: 'not_yet', percent: 0, diffMinor };
    return { kind: 'so_far', percent: Math.min(99, Math.max(1, Math.round((currentMinor / previousMinor) * 100))), diffMinor };
  }
  if (previousMinor <= 0) return { kind: 'new', percent: null, diffMinor };
  const percent = Math.round((diffMinor / previousMinor) * 100);
  if (percent === 0) return { kind: 'same', percent: 0, diffMinor };
  return percent > 0 ? { kind: 'up', percent, diffMinor } : { kind: 'down', percent: -percent, diffMinor };
}

const keyOf = (total: CategoryTotal) => total.categoryId ?? total.category;
const byAmount = (a: { amountMinor: number; name: string }, b: { amountMinor: number; name: string }) =>
  b.amountMinor - a.amountMinor || a.name.localeCompare(b.name, 'ru');

function insightOf(
  rows: AnalyticsCategoryRow[],
  context: { type: AnalyticsType; comparable: boolean; soFar: boolean; trackingDays: number; totalMinor: number }
): AnalyticsInsight | null {
  if (context.totalMinor <= 0 || rows.length === 0) return null;
  const firstDays = firstDaysOf(context.trackingDays);
  if (firstDays) return { kind: 'too_early', ...firstDays };

  if (context.comparable) {
    // Income comes rarely (a salary once a month), so its categories take part whatever their count
    const enough = (row: AnalyticsCategoryRow) => context.type === 'income'
      || (row.count >= ANALYTICS_RULES.minOperations && (row.previousCount ?? 0) >= ANALYTICS_RULES.minOperations);
    const diff = (row: AnalyticsCategoryRow) => row.amountMinor - (row.previousMinor ?? 0);
    const candidates = rows.filter(enough);
    const ups = candidates.filter(row => diff(row) > 0).sort((a, b) => diff(b) - diff(a) || byAmount(a, b));
    const downs = context.soFar ? [] : candidates.filter(row => diff(row) < 0).sort((a, b) => diff(a) - diff(b) || byAmount(a, b));
    const pick = ups[0] ?? downs[0];
    if (pick) {
      if (!pick.previousMinor) return { kind: 'new', categoryId: pick.categoryId, name: pick.name, amountMinor: pick.amountMinor };
      return {
        kind: 'change',
        categoryId: pick.categoryId,
        name: pick.name,
        direction: diff(pick) > 0 ? 'up' : 'down',
        diffMinor: Math.abs(diff(pick)),
        amountMinor: pick.amountMinor,
        previousMinor: pick.previousMinor,
      };
    }
  }

  const [largest] = rows;
  return { kind: 'largest', categoryId: largest.categoryId, name: largest.name, sharePercent: largest.sharePercent };
}

/**
 * The analytics of one month for one type, from the totals of the period and of the previous one:
 * the total and its change, the categories with their shares and changes, and the insight.
 */
export function buildMonthAnalytics(input: {
  type: AnalyticsType;
  period: AnalyticsPeriod;
  previous: AnalyticsPeriod | null;
  trackingDays: number;
  current: PeriodTotals;
  prior: PeriodTotals | null;
}): MonthAnalyticsBody {
  const { type, period, previous, trackingDays, current, prior } = input;
  const categoriesOf = (totals: PeriodTotals) => (type === 'income' ? totals.incomeCategories : totals.categories);
  const totalOf = (totals: PeriodTotals) => (type === 'income' ? totals.incomeMinor : totals.expenseMinor);

  const totalMinor = totalOf(current);
  const previousTotal = previous && prior ? totalOf(prior) : 0;
  const comparable = firstDaysOf(trackingDays) === null && previous !== null && previousTotal > 0;
  const soFar = type === 'income' && !period.wholeMonth;

  const now = categoriesOf(current)
    .map(total => ({ total, name: total.category, amountMinor: total.amountMinor }))
    .sort(byAmount);
  const before = new Map(comparable && prior ? categoriesOf(prior).map(total => [keyOf(total), total]) : []);
  const shares = sharesOf(now.map(entry => entry.amountMinor));

  const rows: AnalyticsCategoryRow[] = now.map(({ total }, index) => {
    const was = before.get(keyOf(total));
    const previousMinor = comparable ? (was?.amountMinor ?? 0) : null;
    return {
      categoryId: keyOf(total),
      name: total.category,
      amountMinor: total.amountMinor,
      count: total.count,
      sharePercent: shares[index],
      hasUsd: total.hasUsd,
      previousMinor,
      previousCount: comparable ? (was?.count ?? 0) : null,
      change: previousMinor === null ? null : changeOf(total.amountMinor, previousMinor, { soFar }),
    };
  });

  // Categories only of the previous period go last, the larger first
  const shown = new Set(rows.map(row => row.categoryId));
  const onlyBefore = [...before.values()]
    .filter(total => !shown.has(keyOf(total)))
    .sort((a, b) => b.amountMinor - a.amountMinor || a.category.localeCompare(b.category, 'ru'))
    .map((total): AnalyticsCategoryRow => ({
      categoryId: keyOf(total),
      name: total.category,
      amountMinor: 0,
      count: 0,
      sharePercent: 0,
      hasUsd: false,
      previousMinor: total.amountMinor,
      previousCount: total.count,
      change: changeOf(0, total.amountMinor, { soFar }),
    }));
  const categories = [...rows, ...onlyBefore];

  return {
    comparable,
    totalMinor,
    hasUsd: rows.some(row => row.hasUsd),
    previousTotalMinor: comparable ? previousTotal : null,
    change: comparable ? changeOf(totalMinor, previousTotal, { soFar }) : null,
    categories,
    insight: insightOf(categories, { type, comparable, soFar, trackingDays, totalMinor }),
  };
}

/** Every day of the period with what the records spent (or brought) on it, dollars at the rate. */
export function daysOf(period: AnalyticsPeriod, records: Transaction[], usdRateMinor: number | null): AnalyticsDay[] {
  const byDay = new Map<string, AnalyticsDay>();
  const last = Number(period.to.slice(8, 10));
  for (let day = 1; day <= last; day++) {
    const date = `${period.month}-${pad(day)}`;
    byDay.set(date, { date, amountMinor: 0, count: 0, hasUsd: false });
  }
  for (const record of records) {
    const entry = byDay.get(recordDay(record));
    const minor = uzsMinorOf(record, usdRateMinor);
    // Dollars without a rate stay out of the bars, as they stay out of the totals
    if (!entry || minor === null) continue;
    entry.amountMinor += minor;
    entry.count += 1;
    if (record.currency === 'USD') entry.hasUsd = true;
  }
  return [...byDay.values()];
}

/** Newest first: by day, then by when it was written, then by id. */
export function newestFirst(a: Transaction, b: Transaction): number {
  return recordDay(b).localeCompare(recordDay(a))
    || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    || (b.id ?? '').localeCompare(a.id ?? '');
}
