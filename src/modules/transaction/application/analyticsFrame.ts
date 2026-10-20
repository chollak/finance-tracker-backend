import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ValidationError } from '../../../shared/domain/errors/AppError';
import { todayDateOnly } from '../../../shared/domain/dates/dateOnly';
import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';
import { countsAs, PeriodTotals, summarizePeriod } from '../domain/periodTotals';
import {
  AnalyticsFirstDays,
  AnalyticsPeriod,
  AnalyticsType,
  analyticsPeriods,
  firstDaysOf,
  isInPeriod,
  isValidMonth,
  trackingDaysOf,
} from '../domain/monthAnalytics';
import { PeriodTotalsService } from './periodTotalsService';

/** Dollars in the numbers shown: the footnote «Доллары пересчитаны по курсу ЦБ: 1 USD = 12 650 сум». */
export interface AnalyticsUsd {
  /** Dollars among the records shown: of this type (of the category), in the period or in the one compared. */
  present: boolean;
  /** No rate yet: the dollars are left out. */
  missingRate: boolean;
  rateMinor: number | null;
  source: 'cbu' | 'own' | null;
}

/** What both analytics answers share (FT-120): the month, its periods, the first days and the dollars. */
export interface AnalyticsFrame {
  /** YYYY-MM */
  month: string;
  /** Today in Tashkent, YYYY-MM-DD. */
  today: string;
  currentMonth: string;
  /** The month of the first record: the month stepper goes back no further. */
  firstMonth: string;
  period: AnalyticsPeriod;
  /** What the period is compared with; null for the first month of recording. */
  previous: AnalyticsPeriod | null;
  /** The first 7 days of recording, while they last (FT-141): no comparison, «выводы через 4 дня». */
  firstDays: AnalyticsFirstDays | null;
  usd: AnalyticsUsd;
}

export interface ReadFrame {
  frame: Omit<AnalyticsFrame, 'usd'>;
  trackingDays: number;
  /** Records of the period and of the previous one. */
  records: Transaction[];
  rate: { rateMinor: number; source: 'cbu' | 'own' | null } | null;
  current: PeriodTotals;
  prior: PeriodTotals | null;
}

export const failAnalytics = (message: string, field: string) => ResultHelper.failure(new ValidationError(message, field));

/**
 * Reads what both analytics routes stand on: the month asked for (the current one by default), the periods
 * compared, the records of both read once and their totals through the one totals service of FT-103 — dollars
 * at the user's effective rate, records awaiting review and movements of own money apart, deleted and archived
 * records not read at all. Moves (`/api/moves`) are not records and never get here.
 */
export async function readAnalyticsFrame(
  repository: TransactionRepository,
  periodTotals: PeriodTotalsService,
  input: { userId: string; month: unknown; type: AnalyticsType; now: Date }
): Promise<Result<ReadFrame>> {
  const today = todayDateOnly(input.now);
  const currentMonth = today.slice(0, 7);
  const month = input.month === undefined ? currentMonth : input.month;
  if (!isValidMonth(month)) return failAnalytics('month must be YYYY-MM', 'month');
  if (month > currentMonth) return failAnalytics('month must not be after the current month', 'month');

  const firstRecordDate = await repository.findFirstRecordDate(input.userId);
  const firstMonth = firstRecordDate && firstRecordDate.slice(0, 7) < currentMonth ? firstRecordDate.slice(0, 7) : currentMonth;
  const { period, previous } = analyticsPeriods({ month, today, type: input.type, firstMonth });
  const trackingDays = trackingDaysOf(firstRecordDate, today);

  const records = await repository.getByUserIdAndDateRange(input.userId, new Date((previous ?? period).from), new Date(period.to));
  const inPeriod = records.filter(record => isInPeriod(record, period));
  const inPrevious = previous ? records.filter(record => isInPeriod(record, previous)) : [];
  // One rate for both periods: the one in effect now
  const rateInfo = await periodTotals.usdRateInfoFor(input.userId, records);
  const usdRateMinor = rateInfo?.rateMinor ?? null;

  return ResultHelper.success({
    frame: { month, today, currentMonth, firstMonth, period, previous, firstDays: firstDaysOf(trackingDays) },
    trackingDays,
    records,
    rate: rateInfo ? { rateMinor: rateInfo.rateMinor, source: rateInfo.source ?? null } : null,
    current: summarizePeriod(inPeriod, { usdRateMinor }),
    prior: previous ? summarizePeriod(inPrevious, { usdRateMinor }) : null,
  });
}

/** Dollars among the records shown — of this type (and category), in the period or in the one compared. */
export function analyticsUsdOf(read: ReadFrame, type: AnalyticsType, comparable: boolean, categoryId?: string): AnalyticsUsd {
  const { period, previous } = read.frame;
  const present = read.records.some(record => record.currency === 'USD'
    && countsAs(record) === type
    && (categoryId === undefined || record.categoryId === categoryId)
    && (isInPeriod(record, period) || (comparable && previous !== null && isInPeriod(record, previous))));
  if (!present) return { present: false, missingRate: false, rateMinor: null, source: null };
  if (!read.rate) return { present: true, missingRate: true, rateMinor: null, source: null };
  return { present: true, missingRate: false, rateMinor: read.rate.rateMinor, source: read.rate.source };
}
