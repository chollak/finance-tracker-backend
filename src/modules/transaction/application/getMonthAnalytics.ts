import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { TransactionRepository } from '../domain/transactionRepository';
import { AnalyticsType, MonthAnalyticsBody, buildMonthAnalytics } from '../domain/monthAnalytics';
import { PeriodTotalsService } from './periodTotalsService';
import { AnalyticsFrame, analyticsUsdOf, failAnalytics, readAnalyticsFrame } from './analyticsFrame';

const logger = getLogger(LogCategory.TRANSACTION);

/** `GET /api/analytics?month&type` (FT-120). */
export interface MonthAnalytics extends AnalyticsFrame, MonthAnalyticsBody {
  type: AnalyticsType;
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

  /**
   * `today` (YYYY-MM-DD) tells the month as it is on that day in the user's calendar — the bot's daily summary for
   * a user outside Tashkent (FT-124); by default it is today in Tashkent.
   */
  async execute(input: { userId: string; query: Record<string, unknown>; today?: string }): Promise<Result<MonthAnalytics>> {
    const type = typeOf(input.query.type);
    if (!type) return failAnalytics('type must be expense or income', 'type');

    try {
      const read = await readAnalyticsFrame(this.repository, this.periodTotals, { userId: input.userId, month: input.query.month, type, now: this.now(), today: input.today });
      if (!read.success) return read;
      const { frame, trackingDays, current, prior } = read.data;
      const body = buildMonthAnalytics({ type, period: frame.period, previous: frame.previous, trackingDays, current, prior });
      return ResultHelper.success({ ...frame, type, ...body, usd: analyticsUsdOf(read.data, type, body.comparable) });
    } catch (error) {
      logger.error('Failed to compute analytics', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to compute analytics'));
    }
  }
}
