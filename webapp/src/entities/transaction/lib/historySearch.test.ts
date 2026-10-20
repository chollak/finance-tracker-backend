import { describe, expect, it } from 'vitest';
import { MINUS, NBSP } from '@/shared/lib/money';
import { formatNetMinor, isHistoryNarrowed, parseHistorySearch } from './historySearch';

/**
 * FT-116, SearchField.md: a query is words and digits — every word must be found in the category, the note or the
 * account, the digits start the amount («25 000» finds coffee for 25 000, not the salary of 12 500 000). The server
 * searches the records (GET /api/transactions); here the query is read the same way to know when History is narrowed.
 */

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
    expect(isHistoryNarrowed({ text: '', categoryId: null, accountId: null, type: null })).toBe(false);
    expect(isHistoryNarrowed({ text: '   ', categoryId: null, accountId: null, type: null })).toBe(false);
    expect(isHistoryNarrowed({ text: 'такси', categoryId: null, accountId: null, type: null })).toBe(true);
    expect(isHistoryNarrowed({ text: '', categoryId: 'c-cafe', accountId: null, type: null })).toBe(true);
    expect(isHistoryNarrowed({ text: '', categoryId: null, accountId: 'cash', type: null })).toBe(true);
    expect(isHistoryNarrowed({ text: '', categoryId: null, accountId: null, type: 'income' })).toBe(true);
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
