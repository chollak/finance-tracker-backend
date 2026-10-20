import type { Transaction } from '@/shared/types';

/**
 * The analytics answers of FT-120 as `GET /api/analytics` and `GET /api/analytics/categories/:id` give them
 * (docs/pastel/api.md, «Аналитика»): kinds and numbers in сум minor units, no copy — the screens write the words
 * (FT-121).
 */
export type AnalyticsType = 'expense' | 'income';

export interface AnalyticsPeriod {
  /** YYYY-MM */
  month: string;
  /** YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
  /** A whole month: one that is over, or the previous month compared in full. The current month never is. */
  wholeMonth: boolean;
}

/** «↑ 40%», «↓ 15%», «как было», «новое»; income of an unfinished month: «пока 60%», «пока нет». */
export interface AnalyticsChange {
  kind: 'up' | 'down' | 'same' | 'new' | 'so_far' | 'not_yet';
  /** Whole percent: the change for up/down/same, the share of the previous period for so_far/not_yet; null for new. */
  percent: number | null;
  /** This period minus the previous one. */
  diffMinor: number;
}

export interface AnalyticsCategoryRow {
  categoryId: string;
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

export type AnalyticsInsight =
  | { kind: 'change'; categoryId: string; name: string; direction: 'up' | 'down'; diffMinor: number; amountMinor: number; previousMinor: number }
  | { kind: 'new'; categoryId: string; name: string; amountMinor: number }
  | { kind: 'largest'; categoryId: string; name: string; sharePercent: number }
  | { kind: 'too_early'; days: number; daysLeft: number };

/** The first 7 days of recording: no comparison and no insight yet. */
export interface AnalyticsFirstDays {
  days: number;
  daysLeft: number;
}

/** Dollars among the numbers shown, for the footnote «Доллары пересчитаны по курсу ЦБ: 1 USD = 12 650 сум». */
export interface AnalyticsUsd {
  present: boolean;
  missingRate: boolean;
  rateMinor: number | null;
  source: 'cbu' | 'own' | null;
}

/** What both answers share: the month, its periods, the first days and the dollars. */
export interface AnalyticsFrame {
  month: string;
  /** Today in Tashkent, YYYY-MM-DD: the current month is labelled «1–14 октября» by it. */
  today: string;
  currentMonth: string;
  /** The month of the first record: the month stepper goes back no further. */
  firstMonth: string;
  period: AnalyticsPeriod;
  /** What the period is compared with; null for the first month of recording. */
  previous: AnalyticsPeriod | null;
  firstDays: AnalyticsFirstDays | null;
  usd: AnalyticsUsd;
}

/** `GET /api/analytics?month&type`. */
export interface MonthAnalytics extends AnalyticsFrame {
  type: AnalyticsType;
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

/** `GET /api/analytics/categories/:id?month`. */
export interface CategoryAnalytics extends AnalyticsFrame {
  category: { id: string; name: string; type: AnalyticsType };
  comparable: boolean;
  amountMinor: number;
  count: number;
  /** Share of all the month's expenses (or income). */
  sharePercent: number;
  hasUsd: boolean;
  previousMinor: number | null;
  change: AnalyticsChange | null;
  /** Every day of the period: the current month has all its days, empty after today. */
  days: AnalyticsDay[];
  /** The category's operations of the period, newest first. */
  records: Transaction[];
}
