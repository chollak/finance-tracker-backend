import type { Transaction } from '@/shared/types';
import { formatMinor, NBSP, usdToUzsMinor } from '@/shared/lib/money';
import type { HistoryPage, HistoryQuery, NetInUzs } from '../model/types';

/**
 * A history query as SearchField.md reads it (FT-116), the same way the server does (`parseHistorySearch` in
 * src/modules/transaction/domain/transactionHistory.ts): every word must be found in the category, the note or the
 * account, and the digits, all of them together, must start the amount — «25 000» finds coffee for 25 000, not the
 * salary of 12 500 000.
 */
export interface HistorySearch {
  /** Lower case by Russian rules, «ё» as «е». */
  words: string[];
  /** «25 000» → «25000»; empty without digits. */
  amountDigits: string;
}

/** Text as it is compared: lower case by Russian rules, «ё» as «е», single spaces. */
function searchKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

/** Signs, spaces, points and commas separate words and are not searched. Null when there is nothing to search. */
export function parseHistorySearch(text: string): HistorySearch | null {
  const key = searchKey(text).replace(/[−+-]/g, ' ');
  const amountDigits = key.replace(/[^0-9]/g, '');
  const words = key
    .replace(/[0-9\s.,]+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 0);
  return words.length === 0 && amountDigits === '' ? null : { words, amountDigits };
}

/** A search, a category or an account narrows History: what it found is then summed up under the chips. */
export function isHistoryNarrowed(query: HistoryQuery): boolean {
  return parseHistorySearch(query.text) !== null || query.categoryId !== null || query.accountId !== null;
}

function amountMinorOf(record: Transaction): number {
  return record.amountMinor ?? Math.round(record.amount * 100);
}

function matches(record: Transaction, search: HistorySearch): boolean {
  const haystack = searchKey([record.category, record.description, record.merchant].filter(Boolean).join(' '));
  if (!search.words.every((word) => haystack.includes(word))) return false;
  // Whole сум or dollars: minor units are hundredths
  return String(Math.floor(amountMinorOf(record) / 100)).startsWith(search.amountDigits);
}

/**
 * Records in сум of both currencies (TransactionList.md, «Итог дня»): income adds, expenses subtract; dollars at the
 * rate, each record rounded to whole сум like the server's totals; without a rate they are left out.
 */
export function netInUzs(records: readonly Transaction[], rateMinor: number | null): NetInUzs {
  let netMinor = 0;
  let usdPresent = false;
  for (const record of records) {
    let minor: number | null = amountMinorOf(record);
    if (record.currency === 'USD') {
      usdPresent = true;
      minor = rateMinor ? usdToUzsMinor(minor, rateMinor) : null;
    }
    if (minor === null) continue;
    netMinor += record.type === 'income' ? minor : -minor;
  }
  return { netMinor, usd: { present: usdPresent, missingRate: usdPresent && !rateMinor } };
}

/** «−210 400 сум», «≈ +16 118 000 сум» when dollars were converted; null when they could not be. */
export function formatNetMinor(net: NetInUzs): string | null {
  if (net.usd.missingRate) return null;
  const sum = formatMinor(net.netMinor, 'UZS', { sign: 'always' });
  return net.usd.present ? `≈${NBSP}${sum}` : sum;
}

/**
 * A guest's History: the device's records (guest mode goes with FT-128) searched and filtered here by the same
 * rules, newest first, as one page. A guest has no accounts: an account filter finds nothing.
 */
export function deviceHistoryPage(records: readonly Transaction[], query: HistoryQuery): HistoryPage {
  const search = parseHistorySearch(query.text);
  const items = records
    .filter((record) => (query.categoryId === null || record.categoryId === query.categoryId) && query.accountId === null)
    .filter((record) => search === null || matches(record, search))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  return {
    items,
    nextCursor: null,
    summary: isHistoryNarrowed(query) ? { count: items.length, ...netInUzs(items, null) } : null,
  };
}
