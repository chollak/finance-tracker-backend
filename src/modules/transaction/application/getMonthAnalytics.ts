import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError, NotFoundError, ValidationError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { todayDateOnly } from '../../../shared/domain/dates/dateOnly';
import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';
import { CategoryResolver } from '../domain/categoryResolver';
import { countsAs, PeriodTotals, summarizePeriod } from '../domain/periodTotals';
import {
  AnalyticsChange,
  AnalyticsDay,
  AnalyticsPeriod,
  AnalyticsType,
  MonthAnalyticsBody,
  analyticsPeriods,
  buildMonthAnalytics,
  daysOf,
  isInPeriod,
  isValidMonth,
  newestFirst,
  trackingDaysOf,
} from '../domain/monthAnalytics';
import { PeriodTotalsService } from './periodTotalsService';

const logger = getLogger(LogCategory.TRANSACTION);

/** Dollars in the numbers shown: the footnote «Доллары пересчитаны по курсу ЦБ: 1 USD = 12 650 сум». */
export interface AnalyticsUsd {
  /** Dollars among the records shown: of this type (of the category), in the period or in the one compared. */
  present: boolean;
  /** No rate yet: the dollars are left out. */
  missingRate: boolean;
  rateMinor: number | null;
  source: 'cbu' | 'own' | null;
}

interface AnalyticsFrame {
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
  usd: AnalyticsUsd;
}

/** `GET /api/analytics?month&type` (FT-120). */
export interface MonthAnalytics extends AnalyticsFrame, MonthAnalyticsBody {
  type: AnalyticsType;
}

/** `GET /api/analytics/categories/:id?month` (FT-120). */
export interface CategoryAnalytics extends AnalyticsFrame {
  category: { id: string; name: string; type: AnalyticsType };
  comparable: boolean;
  amountMinor: number;
  count: number;
  /** Share of all the month's expenses (or income), as in the month's rows. */
  sharePercent: number;
  hasUsd: boolean;
  previousMinor: number | null;
  change: AnalyticsChange | null;
  /** Every day of the period. */
  days: AnalyticsDay[];
  /** The category's operations in the period, newest first. */
  records: Transaction[];
}

const fail = (message: string, field: string) => ResultHelper.failure(new ValidationError(message, field));

interface ReadFrame {
  frame: Omit<AnalyticsFrame, 'usd'>;
  trackingDays: number;
  /** Records of the period and of the previous one. */
  records: Transaction[];
  rate: { rateMinor: number; source: 'cbu' | 'own' | null } | null;
  current: PeriodTotals;
  prior: PeriodTotals | null;
}

/**
 * Reads what both analytics routes stand on: the month asked for (the current one by default), the periods
 * compared, the records of both read once and their totals through the one totals service of FT-103 — dollars
 * at the user's effective rate, records awaiting review and movements of own money apart, deleted and archived
 * records not read at all. Moves (`/api/moves`) are not records and never get here.
 */
async function readFrame(
  repository: TransactionRepository,
  periodTotals: PeriodTotalsService,
  input: { userId: string; month: unknown; type: AnalyticsType; now: Date }
): Promise<Result<ReadFrame>> {
  const today = todayDateOnly(input.now);
  const currentMonth = today.slice(0, 7);
  const month = input.month === undefined ? currentMonth : input.month;
  if (!isValidMonth(month)) return fail('month must be YYYY-MM', 'month');
  if (month > currentMonth) return fail('month must not be after the current month', 'month');

  const firstRecordDate = await repository.findFirstRecordDate(input.userId);
  const firstMonth = firstRecordDate && firstRecordDate.slice(0, 7) < currentMonth ? firstRecordDate.slice(0, 7) : currentMonth;
  const { period, previous } = analyticsPeriods({ month, today, type: input.type, firstMonth });

  const records = await repository.getByUserIdAndDateRange(input.userId, new Date((previous ?? period).from), new Date(period.to));
  const inPeriod = records.filter(record => isInPeriod(record, period));
  const inPrevious = previous ? records.filter(record => isInPeriod(record, previous)) : [];
  // One rate for both periods: the one in effect now
  const rateInfo = await periodTotals.usdRateInfoFor(input.userId, records);
  const usdRateMinor = rateInfo?.rateMinor ?? null;

  return ResultHelper.success({
    frame: { month, today, currentMonth, firstMonth, period, previous },
    trackingDays: trackingDaysOf(firstRecordDate, today),
    records,
    rate: rateInfo ? { rateMinor: rateInfo.rateMinor, source: rateInfo.source ?? null } : null,
    current: summarizePeriod(inPeriod, { usdRateMinor }),
    prior: previous ? summarizePeriod(inPrevious, { usdRateMinor }) : null,
  });
}

/** Dollars among the records shown — of this type (and category), in the period or in the one compared. */
function usdOf(read: ReadFrame, type: AnalyticsType, comparable: boolean, categoryId?: string): AnalyticsUsd {
  const { period, previous } = read.frame;
  const present = read.records.some(record => record.currency === 'USD'
    && countsAs(record) === type
    && (categoryId === undefined || record.categoryId === categoryId)
    && (isInPeriod(record, period) || (comparable && previous !== null && isInPeriod(record, previous))));
  if (!present) return { present: false, missingRate: false, rateMinor: null, source: null };
  if (!read.rate) return { present: true, missingRate: true, rateMinor: null, source: null };
  return { present: true, missingRate: false, rateMinor: read.rate.rateMinor, source: read.rate.source };
}

function typeOf(value: unknown): AnalyticsType | null {
  if (value === undefined) return 'expense';
  return value === 'expense' || value === 'income' ? value : null;
}

/**
 * Where the money goes in a month (FT-120, design-system «Аналитика»): the total against a fair period, the
 * categories with shares adding up to 100% and their changes, and one insight chosen by the rules.
 */
export class GetMonthAnalyticsUseCase {
  constructor(
    private repository: TransactionRepository,
    private periodTotals: PeriodTotalsService,
    private now: () => Date = () => new Date()
  ) {}

  async execute(input: { userId: string; query: Record<string, unknown> }): Promise<Result<MonthAnalytics>> {
    const type = typeOf(input.query.type);
    if (!type) return fail('type must be expense or income', 'type');

    try {
      const read = await readFrame(this.repository, this.periodTotals, { userId: input.userId, month: input.query.month, type, now: this.now() });
      if (!read.success) return read;
      const { frame, trackingDays, current, prior } = read.data;
      const body = buildMonthAnalytics({ type, period: frame.period, previous: frame.previous, trackingDays, current, prior });
      return ResultHelper.success({ ...frame, type, ...body, usd: usdOf(read.data, type, body.comparable) });
    } catch (error) {
      logger.error('Failed to compute analytics', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to compute analytics'));
    }
  }
}

/**
 * One category of a month (FT-120): its total and change, compared the same way as the month, its spending by
 * day and its operations. Hidden categories too: their records stay in analytics.
 */
export class GetCategoryAnalyticsUseCase {
  constructor(
    private repository: TransactionRepository,
    private periodTotals: PeriodTotalsService,
    private categories: Pick<CategoryResolver, 'findForUser'>,
    private now: () => Date = () => new Date()
  ) {}

  async execute(input: { userId: string; categoryId: string; query: Record<string, unknown> }): Promise<Result<CategoryAnalytics>> {
    try {
      const category = await this.categories.findForUser(input.userId, input.categoryId);
      if (!category) return ResultHelper.failure(new NotFoundError('Category', input.categoryId));

      const read = await readFrame(this.repository, this.periodTotals, { userId: input.userId, month: input.query.month, type: category.type, now: this.now() });
      if (!read.success) return read;
      const { frame, trackingDays, current, prior, records, rate } = read.data;
      const body = buildMonthAnalytics({ type: category.type, period: frame.period, previous: frame.previous, trackingDays, current, prior });
      const row = body.categories.find(entry => entry.categoryId === category.id);
      const own = records
        .filter(record => record.categoryId === category.id && countsAs(record) === category.type && isInPeriod(record, frame.period))
        .sort(newestFirst);

      return ResultHelper.success({
        ...frame,
        category: { id: category.id, name: category.name, type: category.type },
        comparable: body.comparable,
        amountMinor: row?.amountMinor ?? 0,
        count: row?.count ?? 0,
        sharePercent: row?.sharePercent ?? 0,
        hasUsd: row?.hasUsd ?? false,
        previousMinor: body.comparable ? (row?.previousMinor ?? 0) : null,
        change: row?.change ?? null,
        days: daysOf(frame.period, own, rate?.rateMinor ?? null),
        records: own,
        usd: usdOf(read.data, category.type, body.comparable, category.id),
      });
    } catch (error) {
      logger.error('Failed to compute category analytics', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to compute category analytics'));
    }
  }
}
