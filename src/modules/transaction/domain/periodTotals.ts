import { Transaction } from './transactionEntity';
import {
  TransactionSemanticType,
  countsAsIncome,
  countsAsRealExpense,
  normalizeSemanticType,
} from './transactionSemanticType';
import { convertUsdToUzsMinor, minorOf, percentOf } from '../../../shared/domain/money/money';

/** Movements of the user's own money: neither spending nor income. */
export type ExcludedMovementSemanticType = Exclude<TransactionSemanticType, 'expense' | 'income'>;

export interface CategoryTotal {
  categoryId?: string;
  /** The category's current name. */
  category: string;
  amountMinor: number;
  count: number;
  /** Share of the total of its kind (expenses or income), two decimals. */
  percentage: number;
  /** Dollars converted at the rate are inside (FT-120: «≈» before the amount). */
  hasUsd: boolean;
}

/**
 * Income, real expenses and categories of a set of records — one rule for every reader (FT-103):
 * analytics, dashboard, the bot's /today and /stats, the weekly review.
 *
 * - Amounts are in сум (minor units); dollars are converted at one rate, rounded to whole сум. Without
 *   a rate they are left out and `usd.missingRate` says so — dollars are never added to сум as is.
 * - Records awaiting review are counted apart (`needsReview`), not in income or expenses.
 * - Transfers, savings, withdrawals, debts and reimbursements are `excludedMovements`.
 */
export interface PeriodTotals {
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  /** Real expenses by category, largest first. */
  categories: CategoryTotal[];
  /** Income by category, largest first. */
  incomeCategories: CategoryTotal[];
  needsReview: { count: number; totalMinor: number; records: Transaction[] };
  excludedMovements: { totalMinor: number; bySemanticType: Partial<Record<ExcludedMovementSemanticType, number>> };
  recordCount: number;
  usd: { present: boolean; missingRate: boolean; rateMinor: number | null };
}

/** A record's amount in сум minor units, or null for dollars without a rate. */
export function uzsMinorOf(record: Transaction, usdRateMinor: number | null): number | null {
  if (record.currency !== 'USD') return minorOf(record);
  return usdRateMinor === null ? null : convertUsdToUzsMinor(minorOf(record), usdRateMinor);
}

/** A record's meaning in totals; debt-linked records of before FT-072 may still say «expense» — they are debt movements. */
function semanticTypeOf(record: Transaction): TransactionSemanticType {
  return record.isDebtRelated ? 'debt' : normalizeSemanticType(record.semanticType, record.type);
}

/**
 * Whether a record counts as income or as a real expense in totals, by the rules above; null for records
 * awaiting review and for movements of own money (FT-120: the operations of an analytics category).
 */
export function countsAs(record: Transaction): 'income' | 'expense' | null {
  if (record.needsReview === true) return null;
  const semanticType = semanticTypeOf(record);
  if (countsAsIncome(semanticType)) return 'income';
  if (countsAsRealExpense(semanticType)) return 'expense';
  return null;
}

function byCategory(entries: Map<string, CategoryTotal>, total: number): CategoryTotal[] {
  return [...entries.values()]
    .map(entry => ({ ...entry, percentage: percentOf(entry.amountMinor, total) }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

export function summarizePeriod(records: Transaction[], options: { usdRateMinor: number | null }): PeriodTotals {
  let incomeMinor = 0;
  let expenseMinor = 0;
  let needsReviewMinor = 0;
  let excludedMinor = 0;
  let usdPresent = false;
  let missingRate = false;
  const needsReviewRecords: Transaction[] = [];
  const excludedBySemanticType: Partial<Record<ExcludedMovementSemanticType, number>> = {};
  const expenses = new Map<string, CategoryTotal>();
  const incomes = new Map<string, CategoryTotal>();

  const add = (map: Map<string, CategoryTotal>, record: Transaction, minor: number) => {
    const key = record.categoryId ?? record.category;
    const entry = map.get(key) ?? { categoryId: record.categoryId, category: record.category, amountMinor: 0, count: 0, percentage: 0, hasUsd: false };
    entry.amountMinor += minor;
    entry.count += 1;
    if (record.currency === 'USD') entry.hasUsd = true;
    map.set(key, entry);
  };

  for (const record of records) {
    if (record.currency === 'USD') usdPresent = true;
    const minor = uzsMinorOf(record, options.usdRateMinor);
    if (minor === null) {
      missingRate = true;
      continue;
    }

    if (record.needsReview === true) {
      needsReviewRecords.push(record);
      needsReviewMinor += minor;
      continue;
    }

    const counted = countsAs(record);
    if (counted === 'income') {
      incomeMinor += minor;
      add(incomes, record, minor);
    } else if (counted === 'expense') {
      expenseMinor += minor;
      add(expenses, record, minor);
    } else {
      const movement = semanticTypeOf(record) as ExcludedMovementSemanticType;
      excludedMinor += minor;
      excludedBySemanticType[movement] = (excludedBySemanticType[movement] ?? 0) + minor;
    }
  }

  return {
    incomeMinor,
    expenseMinor,
    netMinor: incomeMinor - expenseMinor,
    categories: byCategory(expenses, expenseMinor),
    incomeCategories: byCategory(incomes, incomeMinor),
    needsReview: { count: needsReviewRecords.length, totalMinor: needsReviewMinor, records: needsReviewRecords },
    excludedMovements: { totalMinor: excludedMinor, bySemanticType: excludedBySemanticType },
    recordCount: records.length,
    usd: { present: usdPresent, missingRate, rateMinor: usdPresent ? options.usdRateMinor : null },
  };
}
