import { searchKey } from '../../../shared/domain/text/searchKey';
import { Transaction } from './transactionEntity';

/** What a record is found by in history (FT-107): its note and merchant. The category name is matched apart. */
export function recordSearchText(record: { description?: string | null; merchant?: string | null }): string {
  return searchKey([record.description, record.merchant].filter(Boolean).join(' '));
}

export interface HistoryFilters {
  /** Already a search key (`searchKey`). */
  q?: string;
  categoryIds?: string[];
  accountIds?: string[];
  type?: 'income' | 'expense';
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
}

/** Where the previous page ended: history is ordered by date, then creation time, then id — newest first. */
export interface HistoryCursor {
  date: string;
  /** ISO moment. */
  createdAt: string;
  id: string;
}

export interface HistoryPage {
  items: Transaction[];
  /** Null on the last page. */
  next: HistoryCursor | null;
}
