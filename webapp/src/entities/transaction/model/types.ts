// Re-export transaction types from shared
export type {
  Transaction,
  CreateTransactionDTO,
  UpdateTransactionDTO,
  TransactionSemanticType,
} from '@/shared/types';

import type { Transaction } from '@/shared/types';

/**
 * `GET /api/transactions/totals?from&to` (FT-111): income and real expenses of a period in сум minor
 * units, by the one totals service of the backend — dollars at the user's rate, records awaiting review
 * and movements of own money apart.
 */
export interface PeriodTotals {
  from: string;
  to: string;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  recordCount: number;
  needsReview: { count: number; totalMinor: number };
  excludedMovementsMinor: number;
  usd: { present: boolean; missingRate: boolean; rateMinor: number | null };
}

/**
 * One of `GET /api/transactions/frequent` (FT-114): an expense written at least 3 times in the last 30 days
 * with the same category, note and amount — a quick chip over the composer writes it again in one tap.
 */
export interface FrequentRecord {
  categoryId: string;
  /** As written the last time; may be empty. */
  note: string;
  amountMinor: number;
  currency: 'UZS' | 'USD';
  /** The account of the latest of them. */
  accountId: string | null;
  count: number;
}

/** What History is narrowed by (FT-116): the search text, one category, one account, one type. */
export interface HistoryQuery {
  text: string;
  categoryId: string | null;
  accountId: string | null;
  /** Only expenses or only income; null — both. */
  type: 'income' | 'expense' | null;
}

/**
 * A sum in сум of records of both currencies: income adds, expenses subtract; dollars at the user's rate, each
 * record rounded to whole сум (money-model.md), and without a rate they are left out (`missingRate`).
 */
export interface NetInUzs {
  netMinor: number;
  usd: { present: boolean; missingRate: boolean };
}

/** Everything a search or a filter found, all pages (FilterChips.md: «2 операции · −109 000 сум»). */
export interface HistorySummary extends NetInUzs {
  count: number;
}

/**
 * A page of `GET /api/transactions` (FT-107, FT-116): records newest first, the next page's cursor (null on the
 * last page) and, on the first page of a search or a filter, what all of it found.
 */
export interface HistoryPage {
  items: Transaction[];
  nextCursor: string | null;
  summary: HistorySummary | null;
}
