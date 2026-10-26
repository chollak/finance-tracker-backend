import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError, ValidationError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { isValidDateOnly } from '../../../shared/domain/dates/dateOnly';
import { TransactionRepository } from '../domain/transactionRepository';
import { PeriodTotals } from '../domain/periodTotals';
import { PeriodTotalsService } from './periodTotalsService';

const logger = getLogger(LogCategory.TRANSACTION);

/** `GET /api/transactions/totals` — income and expenses of a period, in сум minor units (FT-111). */
export interface PeriodTotalsSummary {
  /** YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  recordCount: number;
  /** Records awaiting review: counted apart, not in income or expenses. */
  needsReview: { count: number; totalMinor: number };
  /** Transfers, savings, withdrawals, debts, reimbursements: neither income nor expenses. */
  excludedMovementsMinor: number;
  usd: PeriodTotals['usd'];
}

const fail = (message: string, field: string) => ResultHelper.failure(new ValidationError(message, field));

/**
 * Totals of the user's records between two dates (FT-111: the month tiles on Home). One rule for every
 * reader — the period totals service of FT-103: dollars at the user's rate, `needsReview` and movements
 * of own money apart; deleted and archived records are not read at all.
 */
export class GetPeriodTotalsUseCase {
  constructor(
    private repository: TransactionRepository,
    private periodTotals: PeriodTotalsService
  ) {}

  async execute(input: { userId: string; query: Record<string, unknown> }): Promise<Result<PeriodTotalsSummary>> {
    const { from, to } = input.query;
    if (!isValidDateOnly(from)) return fail('from must be a date YYYY-MM-DD', 'from');
    if (!isValidDateOnly(to)) return fail('to must be a date YYYY-MM-DD', 'to');
    if (from > to) return fail('from must not be after to', 'from');

    try {
      const totals = await this.forPeriod(input.userId, from, to);
      return ResultHelper.success({
        from,
        to,
        incomeMinor: totals.incomeMinor,
        expenseMinor: totals.expenseMinor,
        netMinor: totals.netMinor,
        recordCount: totals.recordCount,
        needsReview: { count: totals.needsReview.count, totalMinor: totals.needsReview.totalMinor },
        excludedMovementsMinor: totals.excludedMovements.totalMinor,
        usd: totals.usd,
      });
    } catch (error) {
      logger.error('Failed to compute period totals', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to compute period totals'));
    }
  }

  /**
   * The full totals of the period, categories included, for the bot's summaries (FT-124): the same records
   * and rule as the answer above. Days are YYYY-MM-DD, both included; storage errors are thrown.
   */
  async forPeriod(userId: string, from: string, to: string): Promise<PeriodTotals> {
    const records = await this.repository.getByUserIdAndDateRange(userId, new Date(from), new Date(to));
    return this.periodTotals.summarize(userId, records);
  }
}
