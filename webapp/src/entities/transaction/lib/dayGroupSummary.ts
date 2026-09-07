import type { TransactionSemanticType } from '@/shared/types';
import { formatCurrency } from '@/shared/lib/formatters';
import { pluralWithCount } from '@/shared/lib/plural';
import { isNonExpenseMovement } from './semanticType';

/**
 * Day totals for the History list (FT-081).
 *
 * History groups rows by day, and a day header without a number is just a divider.
 * The number it earns has to be the one the user already trusts elsewhere: **real
 * expenses only**, by the same rules the backend uses for real-expense analytics and
 * the Home today-total uses for «Потрачено сегодня». Summing every outgoing row would
 * be a different number under the same word and would silently contradict Home.
 *
 * Everything the total deliberately leaves out is still counted — as a quiet note, so
 * a day with three transfers never looks like a day with nothing in it.
 */

/**
 * Minimal shape the summary needs. Structural, not nominal: both `Transaction` and
 * `TransactionViewModel` satisfy it, so a group can be summarized without a conversion.
 */
export interface DayGroupTransaction {
  amount: number;
  type: 'income' | 'expense';
  semanticType?: TransactionSemanticType;
  needsReview?: boolean;
}

export interface DayGroupSummary {
  /** Sum of rows that count as real spending. */
  realExpenseTotal: number;
  realExpenseCount: number;
  /** Income of the same day — reported separately, never netted against expenses. */
  incomeTotal: number;
  incomeCount: number;
  /** Outgoing rows that are movement, not spending: transfers, savings, cash, debt, refunds. */
  excludedCount: number;
  /** Rows still awaiting a correction — left out of every total until the user confirms them. */
  needsReviewCount: number;
}

/** Label in front of the day amount, so the number can never be read as a net total. */
export const DAY_EXPENSE_TOTAL_LABEL = 'Расходы';

export function summarizeDayGroup(transactions: DayGroupTransaction[]): DayGroupSummary {
  const summary: DayGroupSummary = {
    realExpenseTotal: 0,
    realExpenseCount: 0,
    incomeTotal: 0,
    incomeCount: 0,
    excludedCount: 0,
    needsReviewCount: 0,
  };

  for (const transaction of transactions) {
    // An unconfirmed parse is not evidence of anything yet — it stays out of both
    // totals and is surfaced as work to do instead.
    if (transaction.needsReview === true) {
      summary.needsReviewCount += 1;
      continue;
    }

    if (transaction.type === 'income') {
      summary.incomeTotal += Math.abs(transaction.amount);
      summary.incomeCount += 1;
      continue;
    }

    // Rows without an explicit semanticType predate the field — the backend treats
    // them as ordinary expenses, so the same fallback applies here.
    const semanticType = transaction.semanticType ?? 'expense';

    if (isNonExpenseMovement(semanticType)) {
      summary.excludedCount += 1;
      continue;
    }

    summary.realExpenseTotal += Math.abs(transaction.amount);
    summary.realExpenseCount += 1;
  }

  return summary;
}

/**
 * The day header's right-hand number, or `null` when the day has no real spending —
 * a «Расходы 0» on a day of transfers would read as a fact rather than as an absence.
 */
export function formatDayGroupExpenseTotal(summary: DayGroupSummary): string | null {
  if (summary.realExpenseCount === 0) return null;

  return `${DAY_EXPENSE_TOTAL_LABEL} ${formatCurrency(summary.realExpenseTotal)}`;
}

/**
 * What the day total does not say: income, movements that are not spending, and rows
 * waiting for a correction. `null` when the total already tells the whole day.
 */
export function formatDayGroupNote(summary: DayGroupSummary): string | null {
  const parts: string[] = [];

  if (summary.incomeCount > 0) {
    parts.push(`доход ${formatCurrency(summary.incomeTotal)}`);
  }

  if (summary.excludedCount > 0) {
    parts.push(`${summary.excludedCount} не в счёт`);
  }

  if (summary.needsReviewCount > 0) {
    parts.push(`${pluralWithCount(summary.needsReviewCount, 'запись', 'записи', 'записей')} на проверку`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}
