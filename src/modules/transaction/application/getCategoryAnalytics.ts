import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError, NotFoundError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { Transaction } from '../domain/transactionEntity';
import { TransactionRepository } from '../domain/transactionRepository';
import { CategoryResolver } from '../domain/categoryResolver';
import { countsAs } from '../domain/periodTotals';
import {
  AnalyticsChange,
  AnalyticsDay,
  AnalyticsType,
  buildMonthAnalytics,
  daysOf,
  isInPeriod,
  newestFirst,
} from '../domain/monthAnalytics';
import { PeriodTotalsService } from './periodTotalsService';
import { AnalyticsFrame, analyticsUsdOf, readAnalyticsFrame } from './analyticsFrame';

const logger = getLogger(LogCategory.TRANSACTION);

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

      const read = await readAnalyticsFrame(this.repository, this.periodTotals, { userId: input.userId, month: input.query.month, type: category.type, now: this.now() });
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
        usd: analyticsUsdOf(read.data, category.type, body.comparable, category.id),
      });
    } catch (error) {
      logger.error('Failed to compute category analytics', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to compute category analytics'));
    }
  }
}
