import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { todayDateOnly } from '../../../shared/domain/dates/dateOnly';
import { TransactionRepository } from '../domain/transactionRepository';
import { FREQUENT_RECORDS_RULE, FrequentRecord, FrequentRecordsRule, pickFrequentRecords } from '../domain/frequentRecords';

const logger = getLogger(LogCategory.TRANSACTION);

/** `GET /api/transactions/frequent` — the user's frequent expenses for the quick chips (FT-114). */
export interface FrequentRecords {
  items: FrequentRecord[];
}

/** YYYY-MM-DD `days` days before `date`. */
function daysBefore(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

/**
 * The frequent expenses of the last 30 days (the rule is `FREQUENT_RECORDS_RULE`), counted from today in
 * the user's time zone. Deleted and archived records are not read.
 */
export class GetFrequentRecordsUseCase {
  constructor(
    private repository: TransactionRepository,
    private rule: FrequentRecordsRule = FREQUENT_RECORDS_RULE
  ) {}

  async execute(input: { userId: string; today?: string }): Promise<Result<FrequentRecords>> {
    const to = input.today ?? todayDateOnly();
    const from = daysBefore(to, this.rule.days - 1);

    try {
      const records = await this.repository.getByUserIdAndDateRange(input.userId, new Date(from), new Date(to));
      return ResultHelper.success({ items: pickFrequentRecords(records, this.rule) });
    } catch (error) {
      logger.error('Failed to read frequent records', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to read frequent records'));
    }
  }
}
