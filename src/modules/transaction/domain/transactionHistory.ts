import { convertUsdToUzsMinor } from '../../../shared/domain/money/money';
import { searchKey } from '../../../shared/domain/text/searchKey';
import { RecordCurrency } from './recordSource';
import { Transaction } from './transactionEntity';

/** What a record is found by in history (FT-107): its note and merchant. The category name is matched apart. */
export function recordSearchText(record: { description?: string | null; merchant?: string | null }): string {
  return searchKey([record.description, record.merchant].filter(Boolean).join(' '));
}

/**
 * A history query as SearchField.md reads it (FT-116): every word must be found — in the note or merchant, the
 * category's name or the account's name — and the digits, all of them together, must start the amount.
 */
export interface HistorySearch {
  /** Search keys (`searchKey`): lower case by Russian rules, «ё» as «е». */
  words: string[];
  /** «25 000» → «25000»; empty when the query has no digits. */
  amountDigits: string;
}

/**
 * «Такси наличные» → two words; «25 000» → the amount 25000…; «кофе −25,5» → «кофе» and 255…. Signs, spaces,
 * points and commas separate words and are not searched; anything else is a word, «%» too. Null for a query
 * with nothing to search.
 */
export function parseHistorySearch(query: string): HistorySearch | null {
  const key = searchKey(query).replace(/[−+-]/g, ' ');
  const amountDigits = key.replace(/[^0-9]/g, '');
  const words = key
    .replace(/[0-9\s.,]+/g, ' ')
    .split(' ')
    .filter(word => word.length > 0);
  return words.length === 0 && amountDigits === '' ? null : { words, amountDigits };
}

export interface HistoryFilters {
  search?: HistorySearch;
  categoryIds?: string[];
  accountIds?: string[];
  type?: 'income' | 'expense';
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
}

/** A search or a filter narrows history: the result then has a summary (FT-116). */
export function narrowsHistory(filters: HistoryFilters): boolean {
  return Boolean(filters.search || filters.categoryIds || filters.accountIds || filters.type || filters.from || filters.to);
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

/** What the summary of a search needs of each record it found. */
export interface HistoryAmount {
  type: 'income' | 'expense';
  currency: RecordCurrency;
  amountMinor: number;
}

/**
 * Everything a search or a filter found, not only its first page (FilterChips.md: «2 операции · −109 000 сум»):
 * how many records and their sum in сум — income adds, expenses subtract, whatever the record means.
 */
export interface HistorySummary {
  count: number;
  /** сум minor units. Dollars at the user's rate, each record rounded to whole сум (money-model.md). */
  netMinor: number;
  /** Dollars were found (the sum is then approximate, «≈»); without a rate they are left out of `netMinor`. */
  usd: { present: boolean; missingRate: boolean };
}

export function summarizeHistory(amounts: readonly HistoryAmount[], usdRateMinor: number | null): HistorySummary {
  let netMinor = 0;
  let usdPresent = false;
  for (const amount of amounts) {
    let minor: number | null = amount.amountMinor;
    if (amount.currency === 'USD') {
      usdPresent = true;
      minor = usdRateMinor === null ? null : convertUsdToUzsMinor(amount.amountMinor, usdRateMinor);
    }
    if (minor === null) continue;
    netMinor += amount.type === 'income' ? minor : -minor;
  }
  return { count: amounts.length, netMinor, usd: { present: usdPresent, missingRate: usdPresent && usdRateMinor === null } };
}
