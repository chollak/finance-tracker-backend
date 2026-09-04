import { format, parseISO } from 'date-fns';
import { isNonExpenseMovement } from '@/entities/transaction';
import type { TransactionSemanticType } from '@/shared/types';
import { pluralWithCount } from '@/shared/lib/plural';

/**
 * Minimal shape the today-total needs from a transaction.
 *
 * Structural, not nominal: both `Transaction` and `TransactionViewModel`
 * satisfy it, so the widget can be fed either without a conversion step.
 */
export interface TodayTotalTransaction {
  amount: number;
  type: 'income' | 'expense';
  semanticType?: TransactionSemanticType;
  needsReview?: boolean;
  isArchived?: boolean;
  /** Business date, `yyyy-MM-dd` in practice; an ISO datetime is tolerated. */
  date: string;
  /** ISO datetime of when the row was recorded, used for "последняя HH:mm". */
  createdAt?: string;
}

export interface TodayTotal {
  /** Sum of real expenses recorded for the local day. */
  total: number;
  /** How many rows the total is made of. */
  count: number;
  /**
   * Outgoing rows of the same day that are deliberately not in the total
   * (transfers, savings, cash withdrawals, debts, refunds, `needsReview`).
   * Kept visible so a 0 total never looks like lost data.
   */
  excludedCount: number;
  /** ISO datetime of the most recent counted row, or null. */
  lastAt: string | null;
}

/**
 * Local calendar day of a transaction date.
 *
 * The backend stores `date` as a plain `yyyy-MM-dd` column, so the common case
 * is already a local day key and must not be pushed through a UTC conversion.
 * A full ISO datetime (guest rows, future shapes) is converted to the local day.
 */
function toLocalDayKey(date: string): string {
  if (!date) return '';
  if (!date.includes('T')) return date.slice(0, 10);

  const parsed = parseISO(date);
  return Number.isNaN(parsed.getTime()) ? date.slice(0, 10) : format(parsed, 'yyyy-MM-dd');
}

function timestampOf(createdAt: string | undefined): number | null {
  if (!createdAt) return null;
  const parsed = new Date(createdAt).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Real money spent today, by the same rules the backend uses for real expenses.
 *
 * Excluded: income, archived rows, rows still waiting for a user correction
 * (`needsReview`), and outgoing movements that are not spending — own transfers,
 * savings deposits, cash withdrawals, debt movements, refunds, group payments
 * (see `isNonExpenseMovement`).
 */
export function calculateTodayTotal(
  transactions: TodayTotalTransaction[],
  now: Date
): TodayTotal {
  const todayKey = format(now, 'yyyy-MM-dd');

  let total = 0;
  let count = 0;
  let excludedCount = 0;
  let lastTimestamp: number | null = null;
  let lastAt: string | null = null;

  for (const transaction of transactions) {
    if (transaction.isArchived === true) continue;
    if (toLocalDayKey(transaction.date) !== todayKey) continue;
    if (transaction.type === 'income') continue;

    // Rows without an explicit semanticType predate the field — the backend
    // treats them as ordinary expenses, so the same fallback applies here.
    const semanticType = transaction.semanticType ?? 'expense';

    if (transaction.needsReview === true || isNonExpenseMovement(semanticType)) {
      excludedCount += 1;
      continue;
    }

    total += Math.abs(transaction.amount);
    count += 1;

    const timestamp = timestampOf(transaction.createdAt);
    if (timestamp !== null && (lastTimestamp === null || timestamp > lastTimestamp)) {
      lastTimestamp = timestamp;
      lastAt = transaction.createdAt ?? null;
    }
  }

  return { total, count, excludedCount, lastAt };
}

/** Copy shown instead of the meta line when nothing was recorded today. */
export const TODAY_TOTAL_EMPTY_HINT = 'Пока ничего не записано — начните с одной строки';

/**
 * Quiet one-liner under the amount: how many rows it is made of, when the last
 * one landed, and how many same-day rows were deliberately left out.
 *
 * Returns `null` when the day is completely empty — the UI shows the empty hint
 * instead of an "0 операций" line.
 */
export function formatTodayTotalMeta(summary: TodayTotal): string | null {
  if (summary.count === 0 && summary.excludedCount === 0) return null;

  const parts = [pluralWithCount(summary.count, 'операция', 'операции', 'операций')];

  const lastTimestamp = timestampOf(summary.lastAt ?? undefined);
  if (lastTimestamp !== null) {
    parts.push(`последняя ${format(lastTimestamp, 'HH:mm')}`);
  }

  if (summary.excludedCount > 0) {
    parts.push(`${summary.excludedCount} не в счёт`);
  }

  return parts.join(' · ');
}
