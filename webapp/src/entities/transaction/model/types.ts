// Re-export transaction types from shared
export type {
  Transaction,
  CreateTransactionDTO,
  UpdateTransactionDTO,
  TransactionSemanticType,
} from '@/shared/types';

import type { Transaction } from '@/shared/types';
import type { BadgeProps } from '@/shared/ui/badge';

// ViewModel with formatted fields for UI
export interface TransactionViewModel extends Transaction {
  // Formatted fields with _ prefix (View Model Pattern)
  _formattedAmount: string;      // "-50 000 сўм" or "+2 000 000 сўм"
  _formattedDate: string;        // "Сегодня, 15:30" or "14 янв, 15:30"
  _categoryIcon: string;         // "К" — first letter of the category name
  _categoryColor: string;        // "bg-pastel-rose text-pastel-ink"
  _amountColor: string;          // "text-income", "text-expense", or "text-muted-foreground" for non-expense movements
  _typeLabel: string;            // "Доход" or "Расход"
  _semanticTypeLabel: string;            // "Долг", "Перевод себе", ...
  _semanticTypeBadgeVariant: NonNullable<BadgeProps['variant']>;
  _showSemanticTypeBadge: boolean;       // false for ordinary expenses — colour and sign already say it
  _isNonExpenseMovement: boolean;        // true for movements excluded from expense/budget analytics
  _needsReview: boolean;                 // true when semanticType is uncertain and awaits user correction
}

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

/** What History is narrowed by (FT-116): the search text, one category, one account. */
export interface HistoryQuery {
  text: string;
  categoryId: string | null;
  accountId: string | null;
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
