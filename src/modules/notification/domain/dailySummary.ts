import { DEFAULT_TIME_ZONE } from '../../../shared/domain/dates/dateOnly';

/**
 * Итоги дня и месяца (FT-124, docs/pastel/components/BotNotice.md, design-system «Уведомления редкие»): what the
 * bot says at the chosen time and on /today and /month. The numbers come from the one totals service of FT-103
 * and from the analytics of FT-120, so they are the numbers of Home and of the analytics screen.
 */
export const DAILY_SUMMARY_RULES = {
  /** Categories under the total, largest first. */
  topCategories: 3,
  /** «Трат правда не было?» at most this many evenings in a row; again once something is recorded. */
  emptyEveningsInARow: 2,
} as const;

/** The wall clock of a time zone: the day (YYYY-MM-DD) and the time (HH:MM). */
export interface LocalClock {
  date: string;
  time: string;
}

function clockParts(now: Date, timeZone: string): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
}

/** The moment on the user's clock; a time zone Intl does not know reads as Tashkent (users.timezone default). */
export function localClock(now: Date, timeZone: string | undefined): LocalClock {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = clockParts(now, timeZone || DEFAULT_TIME_ZONE);
  } catch {
    parts = clockParts(now, DEFAULT_TIME_ZONE);
  }
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(candidate => candidate.type === type)?.value ?? '00';
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}

/**
 * The summary of the day is due from the chosen time until the day ends: a bot that was down at 21:00 and
 * starts at 22:30 still sends it, one that starts after midnight does not send yesterday's.
 */
export function isSummaryDue(clock: LocalClock, summaryTime: string): boolean {
  return clock.time >= summaryTime;
}

/** A category line: «Продукты · 186 400». */
export interface SummaryCategory {
  name: string;
  amountMinor: number;
}

/** What the comparison is made with: the same days of the month before («1–14 сентября») or all of it. */
export interface ComparedPeriod {
  /** YYYY-MM */
  month: string;
  /** YYYY-MM-DD, the last day compared. */
  to: string;
  wholeMonth: boolean;
}

/** The month so far: «С начала октября — 7 684 400 сум, на 714 400 сум больше, чем за 1–14 сентября». */
export interface MonthSummary {
  /** YYYY-MM */
  month: string;
  /** The day the month is told on, YYYY-MM-DD. */
  today: string;
  /** Real expenses of the month, as Home's month tile counts them. */
  totalMinor: number;
  /** Null while there is nothing fair to compare with (the first days of recording, an empty month before). */
  comparison: { diffMinor: number; previous: ComparedPeriod } | null;
  /** The largest categories, at most DAILY_SUMMARY_RULES.topCategories. */
  categories: SummaryCategory[];
  /** Dollars were left out: there is no rate yet. */
  usdLeftOut: boolean;
}

/** The day: «Потрачено 210 400 сум · 2 записи», the categories and the month so far. */
export interface DaySummary {
  /** YYYY-MM-DD */
  day: string;
  /** Every record of the day, of any kind: none is the empty-day question. */
  recordCount: number;
  expenseMinor: number;
  /** Records counted as expenses. */
  expenseCount: number;
  categories: SummaryCategory[];
  usdLeftOut: boolean;
  month: MonthSummary;
}

/** The totals of a period as the totals service gives them (FT-103: `PeriodTotals`). */
export interface DayTotals {
  recordCount: number;
  expenseMinor: number;
  categories: ReadonlyArray<{ category: string; amountMinor: number; count: number }>;
  usd: { missingRate: boolean };
}

/** The month's expense analytics as the analytics screen gets them (FT-120: `MonthAnalytics`). */
export interface MonthExpenses {
  month: string;
  today: string;
  totalMinor: number;
  comparable: boolean;
  change: { diffMinor: number } | null;
  previous: ComparedPeriod | null;
  categories: ReadonlyArray<{ name: string; amountMinor: number }>;
  usd: { missingRate: boolean };
}

export function monthSummaryOf(analytics: MonthExpenses): MonthSummary {
  const compared = analytics.comparable && analytics.change && analytics.previous;
  return {
    month: analytics.month,
    today: analytics.today,
    totalMinor: analytics.totalMinor,
    comparison: compared
      ? { diffMinor: analytics.change!.diffMinor, previous: { month: analytics.previous!.month, to: analytics.previous!.to, wholeMonth: analytics.previous!.wholeMonth } }
      : null,
    // Categories only of the month before come last with nothing spent: they are not «траты»
    categories: analytics.categories
      .filter(category => category.amountMinor > 0)
      .slice(0, DAILY_SUMMARY_RULES.topCategories)
      .map(category => ({ name: category.name, amountMinor: category.amountMinor })),
    usdLeftOut: analytics.usd.missingRate,
  };
}

export function daySummaryOf(day: string, totals: DayTotals, month: MonthSummary): DaySummary {
  return {
    day,
    recordCount: totals.recordCount,
    expenseMinor: totals.expenseMinor,
    expenseCount: totals.categories.reduce((sum, category) => sum + category.count, 0),
    categories: totals.categories
      .slice(0, DAILY_SUMMARY_RULES.topCategories)
      .map(category => ({ name: category.category, amountMinor: category.amountMinor })),
    usdLeftOut: totals.usd.missingRate,
    month,
  };
}
