import { describe, expect, it } from 'vitest';
import type { Transaction } from '@/shared/types';
import { withKeptRecord } from './keptRecord';

/**
 * FT-116, FilterChips.md: «Запись, которую только что исправили, остаётся в списке, пока фильтр не поменяют» —
 * a record changed so that the filter no longer finds it stays where its date puts it.
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
    expect(ids(withKeptRecord(LIST, record('k', '2026-10-13', '2026-10-13T12:00:00Z')))).toEqual(['a', 'b', 'k', 'c', 'd']);
    expect(ids(withKeptRecord(LIST, record('k', '2026-10-15', '2026-10-15T12:00:00Z')))).toEqual(['k', 'a', 'b', 'c', 'd']);
    expect(ids(withKeptRecord(LIST, record('k', '2026-10-01', '2026-10-01T12:00:00Z')))).toEqual(['a', 'b', 'c', 'd', 'k']);
  });

  it('is shown as the list has it while the filter still finds it', () => {
    const kept = withKeptRecord(LIST, record('b', '2026-10-01', '2026-10-01T12:00:00Z', 'older copy'));

    expect(ids(kept)).toEqual(['a', 'b', 'c', 'd']);
    expect(kept[1].description).toBe('b');
  });

  it('changes nothing when there is none', () => {
    expect(withKeptRecord(LIST, undefined)).toBe(LIST);
  });
});
