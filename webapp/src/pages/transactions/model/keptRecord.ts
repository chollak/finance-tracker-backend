import { netInUzs, type HistoryQuery, type HistorySummary } from '@/entities/transaction';
import type { Transaction } from '@/shared/types';

/** One string per search and set of chips: the record just changed is kept while it stays the same. */
export function historyFilterKey(query: HistoryQuery): string {
  return JSON.stringify([query.text, query.categoryId, query.accountId, query.type]);
}

/** Newest first, as History lists records: by date, then by the time of writing. */
function isNewer(a: Transaction, b: Transaction): boolean {
  return a.date > b.date || (a.date === b.date && (a.createdAt ?? '') > (b.createdAt ?? ''));
}

/** The list as shown, and the record just changed when it is shown although the filter no longer finds it. */
export interface WithKeptRecord {
  items: Transaction[];
  added: Transaction | null;
}

/**
 * FilterChips.md: «Запись, которую только что исправили, остаётся в списке, пока фильтр не поменяют». The list as
 * the server found it, with the record just opened put back where its date puts it if the filter no longer finds it
 * after the change; while the filter still finds it, the list's copy is shown.
 *
 * `more` — pages after these are still to be read. A record older than everything read may then be on one of them,
 * found by the filter: it waits for the pages before its place to be read, and is not counted twice.
 */
export function withKeptRecord(items: Transaction[], kept: Transaction | undefined, more = false): WithKeptRecord {
  if (!kept || items.some((item) => item.id === kept.id)) return { items, added: null };
  const at = items.findIndex((item) => isNewer(kept, item));
  if (at === -1) return more ? { items, added: null } : { items: [...items, kept], added: kept };
  return { items: [...items.slice(0, at), kept, ...items.slice(at)], added: kept };
}

/**
 * The line under the chips counts what the list shows (board «История»: the result line is built from the list):
 * the server's summary of what the filter found, plus the record kept in the list — «2 операции · −170 000 сум».
 * Its dollars go into сум at the rate, like the day totals.
 */
export function summaryWithKept(summary: HistorySummary | null, added: Transaction | null, rateMinor: number | null): HistorySummary | null {
  if (!summary || !added) return summary;
  const kept = netInUzs([added], rateMinor);
  return {
    count: summary.count + 1,
    netMinor: summary.netMinor + kept.netMinor,
    usd: {
      present: summary.usd.present || kept.usd.present,
      missingRate: summary.usd.missingRate || kept.usd.missingRate,
    },
  };
}
