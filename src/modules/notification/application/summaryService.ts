import { DaySummary, DayTotals, MonthExpenses, MonthSummary, daySummaryOf, monthSummaryOf } from '../domain/dailySummary';

/**
 * Where the numbers of the summaries come from (FT-124): the one totals service of FT-103 for a period — the
 * same as `GET /api/transactions/totals`, Home's tiles — and the month's expense analytics of FT-120.
 */
export interface SummaryNumbers {
  /** Totals of the user's records from one day to another, both included. */
  periodTotals(userId: string, from: string, to: string): Promise<DayTotals>;
  /** The expense analytics of the month `today` is in, as the analytics screen shows it on that day. */
  monthExpenses(userId: string, today: string): Promise<MonthExpenses>;
  /** The day of the user's earliest record (YYYY-MM-DD), null before the first one. */
  firstRecordDate(userId: string): Promise<string | null>;
}

/** Итоги дня и месяца for the daily summary, /today and /month (FT-124). */
export class SummaryService {
  constructor(private numbers: SummaryNumbers) {}

  async month(userId: string, today: string): Promise<MonthSummary> {
    return monthSummaryOf(await this.numbers.monthExpenses(userId, today));
  }

  async day(userId: string, day: string): Promise<DaySummary> {
    const [totals, month] = await Promise.all([this.numbers.periodTotals(userId, day, day), this.month(userId, day)]);
    return daySummaryOf(day, totals, month);
  }

  /** Whether the user has any record dated from one day to another. */
  async hasRecords(userId: string, from: string, to: string): Promise<boolean> {
    return (await this.numbers.periodTotals(userId, from, to)).recordCount > 0;
  }

  /** Whether the user had begun recording by the day: a record dated on it or before. */
  async recordedBy(userId: string, day: string): Promise<boolean> {
    const first = await this.numbers.firstRecordDate(userId);
    return first !== null && first <= day;
  }
}
