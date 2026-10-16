import { Transaction } from '../domain/transactionEntity';
import {
  TransactionSemanticType,
  countsAsIncome,
  countsAsRealExpense,
  normalizeSemanticType,
} from '../domain/transactionSemanticType';
import { fromMinor, minorOf } from '../../../shared/domain/money/money';

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
 * Sums are integer minor units (FT-097); the summary reports сум.
 */
export function summarizeWeeklyReview(transactions: Transaction[], range: DateRange): WeeklyReviewSummary {
  const inRange = transactions.filter(transaction => isWithinRange(transaction.date, range));

  let realExpenses = 0;
  let income = 0;
  let excludedMovementsTotal = 0;
  const excludedMinor: Partial<Record<ExcludedMovementSemanticType, number>> = {};
  const needsReviewTransactions: Transaction[] = [];
  let needsReviewTotal = 0;
  const categoryTotals: Record<string, number> = {};

  for (const transaction of inRange) {
    const minor = minorOf(transaction);
    if (transaction.needsReview === true) {
      needsReviewTransactions.push(transaction);
      needsReviewTotal += minor;
      continue;
    }

    const semanticType = normalizeSemanticType(transaction.semanticType, transaction.type);

    if (countsAsIncome(semanticType)) {
      income += minor;
      continue;
    }

    if (countsAsRealExpense(semanticType)) {
      realExpenses += minor;
      categoryTotals[transaction.category] = (categoryTotals[transaction.category] || 0) + minor;
      continue;
    }

    if (isExcludedMovementType(semanticType)) {
      excludedMovementsTotal += minor;
      excludedMinor[semanticType] = (excludedMinor[semanticType] || 0) + minor;
    }
  }

  const topCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([category, minor]) => ({ category, amount: fromMinor(minor) }));

  const excludedMovementsBreakdown: Partial<Record<ExcludedMovementSemanticType, number>> = {};
  for (const [semanticType, minor] of Object.entries(excludedMinor) as Array<[ExcludedMovementSemanticType, number]>) {
    excludedMovementsBreakdown[semanticType] = fromMinor(minor);
  }

  return {
    range,
    realExpenses: fromMinor(realExpenses),
    income: fromMinor(income),
    excludedMovementsTotal: fromMinor(excludedMovementsTotal),
    excludedMovementsBreakdown,
    needsReview: {
      count: needsReviewTransactions.length,
      total: fromMinor(needsReviewTotal),
      transactions: needsReviewTransactions,
    },
    topCategories,
  };
}
