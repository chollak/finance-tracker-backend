import { describe, expect, it } from 'vitest';
import { MINUS, NBSP } from '@/shared/lib/money';
import type { Transaction } from '@/shared/types';
import { deviceHistoryPage, formatNetMinor, isHistoryNarrowed, parseHistorySearch } from './historySearch';

/**
 * FT-116, SearchField.md: a query is words and digits — every word must be found in the category, the note or the
 * account, the digits start the amount («25 000» finds coffee for 25 000, not the salary of 12 500 000). The server
 * searches signed-in users' records (GET /api/transactions); a guest's records are on the device and are searched here.
 */

function record(overrides: Partial<Transaction>): Transaction {
  return { id: 'r', date: '2026-10-14', category: 'Другое', description: '', amount: 0, type: 'expense', userId: 'guest-1', ...overrides };
}

describe('a history query', () => {
  it('is read as words and digits: signs and separators are not words', () => {
    expect(parseHistorySearch('  Такси  ДОМОЙ ')).toEqual({ words: ['такси', 'домой'], amountDigits: '' });
    expect(parseHistorySearch('25 000')).toEqual({ words: [], amountDigits: '25000' });
    expect(parseHistorySearch('кофе −25,5')).toEqual({ words: ['кофе'], amountDigits: '255' });
    expect(parseHistorySearch('Ёлки')).toEqual({ words: ['елки'], amountDigits: '' });
    expect(parseHistorySearch(' − ')).toBeNull();
    expect(parseHistorySearch('')).toBeNull();
  });

  it('narrows History when it has something to search, or a category or an account is chosen', () => {
    expect(isHistoryNarrowed({ text: '', categoryId: null, accountId: null })).toBe(false);
    expect(isHistoryNarrowed({ text: '   ', categoryId: null, accountId: null })).toBe(false);
    expect(isHistoryNarrowed({ text: 'такси', categoryId: null, accountId: null })).toBe(true);
    expect(isHistoryNarrowed({ text: '', categoryId: 'c-cafe', accountId: null })).toBe(true);
    expect(isHistoryNarrowed({ text: '', categoryId: null, accountId: 'cash' })).toBe(true);
  });
});

describe('a guest’s history, searched on the device', () => {
  const records = [
    record({ id: 'a', category: 'Кафе', categoryId: 'g-cafe', description: 'Кофе', amount: 25000, date: '2026-10-12' }),
    record({ id: 'b', category: 'Транспорт', categoryId: 'g-tr', description: 'Такси домой', amount: 32000, date: '2026-10-14' }),
    record({ id: 'c', category: 'Зарплата', categoryId: 'g-zp', type: 'income', description: 'За сентябрь', amount: 12500000, date: '2026-10-13' }),
  ];
  const ids = (page: { items: Transaction[] }) => page.items.map((item) => item.id);

  it('is the whole history, newest first, with nothing to sum up', () => {
    const page = deviceHistoryPage(records, { text: '', categoryId: null, accountId: null });

    expect(ids(page)).toEqual(['b', 'c', 'a']);
    expect(page).toMatchObject({ nextCursor: null, summary: null });
  });

  it('finds every word in the category or the note, and digits at the start of the amount', () => {
    const find = (text: string) => ids(deviceHistoryPage(records, { text, categoryId: null, accountId: null }));

    expect(find('ТАКСИ')).toEqual(['b']);
    expect(find('транспорт домой')).toEqual(['b']);
    expect(find('кафе')).toEqual(['a']);
    expect(find('25 000')).toEqual(['a']);
    expect(find('12 5')).toEqual(['c']);
    expect(find('такси кафе')).toEqual([]);
  });

  it('filters by category and sums up what it found', () => {
    const page = deviceHistoryPage(records, { text: '', categoryId: 'g-tr', accountId: null });

    expect(ids(page)).toEqual(['b']);
    expect(page.summary).toEqual({ count: 1, netMinor: -3_200_000, usd: { present: false, missingRate: false } });
  });
});

describe('a sum in сум', () => {
  it('has its sign always, «≈» when dollars were converted, nothing to show when they could not be', () => {
    expect(formatNetMinor({ netMinor: -10_900_000, usd: { present: false, missingRate: false } })).toBe(`${MINUS}109${NBSP}000${NBSP}сум`);
    expect(formatNetMinor({ netMinor: 1_611_800_000, usd: { present: true, missingRate: false } })).toBe(`≈${NBSP}+16${NBSP}118${NBSP}000${NBSP}сум`);
    expect(formatNetMinor({ netMinor: 0, usd: { present: false, missingRate: false } })).toBe(`0${NBSP}сум`);
    expect(formatNetMinor({ netMinor: -100, usd: { present: true, missingRate: true } })).toBeNull();
  });
});
