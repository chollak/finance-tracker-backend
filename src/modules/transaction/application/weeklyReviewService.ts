import { Transaction } from '../domain/transactionEntity';
import { TransactionSemanticType } from '../domain/transactionSemanticType';
import { fromMinor } from '../../../shared/domain/money/money';
import { summarizePeriod } from '../domain/periodTotals';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export type ExcludedMovementSemanticType = Exclude<TransactionSemanticType, 'expense' | 'income'>;

const EXCLUDED_MOVEMENT_TYPES: readonly ExcludedMovementSemanticType[] = [
  'own_transfer',
  'saving_deposit',
  'debt',
  'reimbursement',
  'cash_withdrawal',
  'group_payment',
];

export interface WeeklyReviewCategoryTotal {
  category: string;
  amount: number;
}

export interface WeeklyReviewNeedsReview {
  count: number;
  total: number;
  transactions: Transaction[];
}

export interface WeeklyReviewSummary {
  range: DateRange;
  realExpenses: number;
  income: number;
  excludedMovementsTotal: number;
  excludedMovementsBreakdown: Partial<Record<ExcludedMovementSemanticType, number>>;
  needsReview: WeeklyReviewNeedsReview;
  topCategories: WeeklyReviewCategoryTotal[];
}

export function getPreviousWeekRange(now = new Date()): DateRange {
  const day = now.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const currentWeekMonday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday
  ));
  const previousWeekMonday = new Date(currentWeekMonday);
  previousWeekMonday.setUTCDate(currentWeekMonday.getUTCDate() - 7);

  const previousWeekSunday = new Date(previousWeekMonday);
  previousWeekSunday.setUTCDate(previousWeekMonday.getUTCDate() + 6);
  previousWeekSunday.setUTCHours(23, 59, 59, 999);

  return {
    startDate: previousWeekMonday,
    endDate: previousWeekSunday,
  };
}

function isWithinRange(dateStr: string, range: DateRange): boolean {
  const date = new Date(dateStr);
  return date >= range.startDate && date <= range.endDate;
}

function isExcludedMovementType(
  semanticType: TransactionSemanticType
): semanticType is ExcludedMovementSemanticType {
  return (EXCLUDED_MOVEMENT_TYPES as readonly string[]).includes(semanticType);
}

/**
 * Summarizes a set of transactions for a date range using semantic rules
 * (real expense vs income vs excluded movement). Transactions flagged
 * needsReview are excluded from all categorized totals and surfaced
 * separately in summary.needsReview until corrected.
 * Built on the shared period totals (FT-103): dollars are converted at `usdRateMinor`, or left out
 * when there is no rate; the summary reports сум.
 */
export function summarizeWeeklyReview(
  transactions: Transaction[],
  range: DateRange,
  options: { usdRateMinor?: number | null } = {}
): WeeklyReviewSummary {
  const inRange = transactions.filter(transaction => isWithinRange(transaction.date, range));
  const totals = summarizePeriod(inRange, { usdRateMinor: options.usdRateMinor ?? null });

  const excludedMovementsBreakdown: Partial<Record<ExcludedMovementSemanticType, number>> = {};
  for (const [semanticType, minor] of Object.entries(totals.excludedMovements.bySemanticType) as Array<[ExcludedMovementSemanticType, number]>) {
    if (isExcludedMovementType(semanticType)) excludedMovementsBreakdown[semanticType] = fromMinor(minor);
  }

  return {
    range,
    realExpenses: fromMinor(totals.expenseMinor),
    income: fromMinor(totals.incomeMinor),
    excludedMovementsTotal: fromMinor(totals.excludedMovements.totalMinor),
    excludedMovementsBreakdown,
    needsReview: {
      count: totals.needsReview.count,
      total: fromMinor(totals.needsReview.totalMinor),
      transactions: totals.needsReview.records,
    },
    topCategories: totals.categories.map(category => ({ category: category.category, amount: fromMinor(category.amountMinor) })),
  };
}
