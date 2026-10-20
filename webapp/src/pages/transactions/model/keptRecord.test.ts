import { describe, expect, it } from 'vitest';
import type { HistorySummary } from '@/entities/transaction';
import type { Transaction } from '@/shared/types';
import { summaryWithKept, withKeptRecord } from './keptRecord';

/**
 * FT-116, FilterChips.md: «Запись, которую только что исправили, остаётся в списке, пока фильтр не поменяют» —
 * a record changed so that the filter no longer finds it stays where its date puts it, and the line under the chips
 * counts it.
 */

function record(id: string, date: string, createdAt: string, description = id): Transaction {
  return { id, date, createdAt, category: 'Кафе', description, amount: 0, type: 'expense', userId: 'u' };
}

const LIST = [
  record('a', '2026-10-14', '2026-10-14T09:00:00Z'),
  record('b', '2026-10-13', '2026-10-13T18:00:00Z'),
  record('c', '2026-10-13', '2026-10-13T08:00:00Z'),
  record('d', '2026-10-11', '2026-10-11T08:00:00Z'),
];
const ids = (items: Transaction[]) => items.map((item) => item.id);

describe('the record just changed', () => {
  it('is put back where its date and time put it when the filter no longer finds it', () => {
    const middle = record('k', '2026-10-13', '2026-10-13T12:00:00Z');
    expect(ids(withKeptRecord(LIST, middle).items)).toEqual(['a', 'b', 'k', 'c', 'd']);
    expect(withKeptRecord(LIST, middle).added).toBe(middle);
    expect(ids(withKeptRecord(LIST, record('k', '2026-10-15', '2026-10-15T12:00:00Z')).items)).toEqual(['k', 'a', 'b', 'c', 'd']);
    expect(ids(withKeptRecord(LIST, record('k', '2026-10-01', '2026-10-01T12:00:00Z')).items)).toEqual(['a', 'b', 'c', 'd', 'k']);
  });

  it('older than every page read, waits while more pages are to come: one of them may have it', () => {
    const older = record('k', '2026-10-01', '2026-10-01T12:00:00Z');

    expect(withKeptRecord(LIST, older, true)).toEqual({ items: LIST, added: null });
    expect(ids(withKeptRecord(LIST, record('k', '2026-10-13', '2026-10-13T12:00:00Z'), true).items)).toEqual(['a', 'b', 'k', 'c', 'd']);
  });

  it('is shown as the list has it while the filter still finds it', () => {
    const kept = withKeptRecord(LIST, record('b', '2026-10-01', '2026-10-01T12:00:00Z', 'older copy'));

    expect(ids(kept.items)).toEqual(['a', 'b', 'c', 'd']);
    expect(kept.items[1].description).toBe('b');
    expect(kept.added).toBeNull();
  });

  it('changes nothing when there is none', () => {
    expect(withKeptRecord(LIST, undefined)).toEqual({ items: LIST, added: null });
    expect(withKeptRecord(LIST, undefined).items).toBe(LIST);
  });
});

describe('the line under the chips with the record kept', () => {
  const found: HistorySummary = { count: 1, netMinor: -2_500_000, usd: { present: false, missingRate: false } };
  const lunch = { ...record('k', '2026-10-13', '2026-10-13T12:00:00Z'), amountMinor: 14_500_000, currency: 'UZS' as const };

  it('counts the record kept in the list and adds its amount', () => {
    expect(summaryWithKept(found, lunch, null)).toEqual({ count: 2, netMinor: -17_000_000, usd: { present: false, missingRate: false } });
    expect(summaryWithKept({ count: 0, netMinor: 0, usd: { present: false, missingRate: false } }, lunch, null)).toEqual({
      count: 1,
      netMinor: -14_500_000,
      usd: { present: false, missingRate: false },
    });
  });

  it('adds dollars at the rate, and says when there is no rate for them', () => {
    const dollars = { ...lunch, type: 'income' as const, amountMinor: 30_000, currency: 'USD' as const };

    expect(summaryWithKept(found, dollars, 1_265_000)).toEqual({ count: 2, netMinor: -2_500_000 + 379_500_000, usd: { present: true, missingRate: false } });
    expect(summaryWithKept(found, dollars, null)).toMatchObject({ count: 2, usd: { present: true, missingRate: true } });
  });

  it('is the server’s summary when no record is kept, or nothing is summed up', () => {
    expect(summaryWithKept(found, null, null)).toBe(found);
    expect(summaryWithKept(null, lunch, null)).toBeNull();
  });
});
