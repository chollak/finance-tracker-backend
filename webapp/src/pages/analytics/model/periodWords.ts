import type { AnalyticsFrame, AnalyticsType } from '@/entities/analytics';
import { monthNameIn, monthNameLower, monthNameOf, monthNameTo, monthTitle, parseLocalDate } from '@/shared/lib/dates';
import { formatMinor, NBSP } from '@/shared/lib/money';

/**
 * The words of the periods analytics compares (design/prototype/Pastel_Analytics.dc.html, `periodOf`): the current
 * month is «1–14 октября» by today, a past month is «сентябрь»; what it is compared with is the same days of the
 * month before («к 1–14 сентября», «чем за 1–14 сентября») or the whole month before («к августу», «чем в августе»).
 */
export interface PeriodWords {
  /** «1–14 октября», «1 октября», «сентябрь». */
  label: string;
  /** «в октябре». */
  inMonth: string;
  previous: PreviousWords | null;
}

export interface PreviousWords {
  /** «к 1–14 сентября», «к августу». */
  to: string;
  /** «чем за 1–14 сентября», «чем в августе». */
  than: string;
  /** «в те же дни сентября», «в августе». */
  in: string;
  /** «как за 1–14 сентября», «как в августе». */
  like: string;
  /** The legend of the tick: «было за 1–14 сентября», «было в августе». */
  legend: string;
  /** «весь сентябрь»: income of an unfinished month is set against it. */
  whole: string;
}

const monthNumber = (month: string) => Number(month.slice(5, 7));

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The month in the address (`?month=2026-09`), or none — the current month. */
export function monthParam(value: string | null): string | undefined {
  return value && MONTH.test(value) ? value : undefined;
}
const lastDay = (date: string) => Number(date.slice(8, 10));

/** «в октябре». */
export const monthIn = (month: string) => `в ${monthNameIn(monthNumber(month))}`;

/** «Октябрь 2026». */
export function monthHeading(month: string): string {
  const { year, month: number } = parseLocalDate(`${month}-01`);
  return monthTitle(year, number);
}

export function periodWords(frame: Pick<AnalyticsFrame, 'month' | 'today' | 'currentMonth' | 'previous'>): PeriodWords {
  const number = monthNumber(frame.month);
  const ongoing = frame.month === frame.currentMonth;
  // The current month is named by the days up to today, as Home's tiles count it
  const today = lastDay(frame.today);
  const label = ongoing ? `${today === 1 ? '1' : `1–${today}`}${NBSP}${monthNameOf(number)}` : monthNameLower(number);

  const previous = frame.previous;
  let words: PreviousWords | null = null;
  if (previous) {
    const before = monthNumber(previous.month);
    const days = `1–${lastDay(previous.to)}${NBSP}${monthNameOf(before)}`;
    const whole = previous.wholeMonth;
    words = {
      to: whole ? `к ${monthNameTo(before)}` : `к ${days}`,
      than: whole ? `чем в ${monthNameIn(before)}` : `чем за ${days}`,
      in: whole ? `в ${monthNameIn(before)}` : `в те же дни ${monthNameOf(before)}`,
      like: whole ? `как в ${monthNameIn(before)}` : `как за ${days}`,
      legend: whole ? `было в ${monthNameIn(before)}` : `было за ${days}`,
      whole: `весь ${monthNameLower(before)}`,
    };
  }
  return { label, inMonth: monthIn(frame.month), previous: words };
}

/** «расходов», «доходов»: «14% расходов». */
export const typeGenitive = (type: AnalyticsType) => (type === 'income' ? 'доходов' : 'расходов');

/** An amount in сум without a sign: «714 400 сум». */
export const som = (minor: number) => formatMinor(Math.abs(minor), 'UZS');

/** «на 714 400 сум больше», «на 90 000 сум меньше». */
export const diffWords = (diffMinor: number) => `на ${som(diffMinor)} ${diffMinor >= 0 ? 'больше' : 'меньше'}`;

/** «↑ 40%», «↓ 15%». */
export const arrow = (direction: 'up' | 'down', percent: number) => `${direction === 'up' ? '↑' : '↓'} ${percent}%`;

/** «1 день», «3 дня», «5 дней». */
export function plural(count: number, one: string, few: string, many: string): string {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) return one;
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return few;
  return many;
}

/** The first letter capital: «В те же дни сентября не было». */
export const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('ru-RU') + value.slice(1);
