import { Transaction } from './transactionEntity';
import { RecordCurrency } from './recordSource';
import { normalizeSemanticType } from './transactionSemanticType';

/**
 * Which expenses the quick chips over the composer offer (FT-114, Composer.md «Частые операции»): up to
 * `limit` of the most frequent «category + note + amount» of the last `days` days, each repeated at least
 * `minRepeats` times. One constant, so the rule is changed in one place and its test says what it is.
 */
export const FREQUENT_RECORDS_RULE = { days: 30, minRepeats: 3, limit: 6 } as const;

export interface FrequentRecordsRule {
  days: number;
  minRepeats: number;
  limit: number;
}

/** A frequent expense, as a chip writes it again in one tap. */
export interface FrequentRecord {
  categoryId: string;
  /** The note as it was written the last time; may be empty. */
  note: string;
  amountMinor: number;
  currency: RecordCurrency;
  /** The account of the latest of these records. */
  accountId: string | null;
  /** How many times it was written in the period. */
  count: number;
}

/** «Кофе», «кофе », «КОФЕ» are one note; «ёлка» and «елка» too. */
function noteKey(note: string | undefined): string {
  return (note ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

/** Real everyday spending: not income, not own money moving, not a record still awaiting review. */
function isRealExpense(record: Transaction): boolean {
  return record.type === 'expense'
    && normalizeSemanticType(record.semanticType, record.type) === 'expense'
    && record.needsReview !== true;
}

/** Newest first: by date, then by when it was written. */
function isNewer(a: Transaction, b: Transaction): boolean {
  if (a.date !== b.date) return a.date > b.date;
  return (a.createdAt ?? '') > (b.createdAt ?? '');
}

interface Group {
  count: number;
  latest: Transaction;
  categoryId: string;
  amountMinor: number;
  currency: RecordCurrency;
}

/**
 * The frequent expenses among `records` (already limited to the period): grouped by category, note
 * (regardless of case, «ё» and spaces) and amount in its currency; the groups of at least `minRepeats`,
 * most frequent first, the more recent first among equals, at most `limit`.
 */
export function pickFrequentRecords(records: readonly Transaction[], rule: FrequentRecordsRule = FREQUENT_RECORDS_RULE): FrequentRecord[] {
  const groups = new Map<string, Group>();

  for (const record of records) {
    if (!isRealExpense(record) || !record.categoryId || record.amountMinor === undefined) continue;
    const currency = record.currency ?? 'UZS';
    const key = [record.categoryId, noteKey(record.description), record.amountMinor, currency].join('\u0000');
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { count: 1, latest: record, categoryId: record.categoryId, amountMinor: record.amountMinor, currency });
    } else {
      group.count += 1;
      if (isNewer(record, group.latest)) group.latest = record;
    }
  }

  return [...groups.values()]
    .filter(group => group.count >= rule.minRepeats)
    .sort((a, b) => b.count - a.count || (isNewer(a.latest, b.latest) ? -1 : isNewer(b.latest, a.latest) ? 1 : 0))
    .slice(0, rule.limit)
    .map(group => ({
      categoryId: group.categoryId,
      note: (group.latest.description ?? '').trim().replace(/\s+/g, ' '),
      amountMinor: group.amountMinor,
      currency: group.currency,
      accountId: group.latest.accountId ?? null,
      count: group.count,
    }));
}
