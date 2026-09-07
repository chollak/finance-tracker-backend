import { describe, it, expect } from 'vitest';
import {
  formatAllTransactionsLabel,
  formatHistorySubtitle,
  formatTransactionsScopeLabel,
} from './transactionCountLabels';

describe('formatAllTransactionsLabel', () => {
  it('drops the numeral for a single transaction', () => {
    expect(formatAllTransactionsLabel(1)).toBe('Все транзакции');
  });

  it('agrees with the count', () => {
    expect(formatAllTransactionsLabel(2)).toBe('Все 2 транзакции');
    expect(formatAllTransactionsLabel(5)).toBe('Все 5 транзакций');
    expect(formatAllTransactionsLabel(11)).toBe('Все 11 транзакций');
    expect(formatAllTransactionsLabel(21)).toBe('Все 21 транзакция');
    expect(formatAllTransactionsLabel(101)).toBe('Все 101 транзакция');
  });
});

describe('formatTransactionsScopeLabel', () => {
  it('agrees the adjective with the total for the active tab', () => {
    expect(formatTransactionsScopeLabel(1, 1, 'active')).toBe('1 из 1 текущей');
    expect(formatTransactionsScopeLabel(2, 2, 'active')).toBe('2 из 2 текущих');
    expect(formatTransactionsScopeLabel(5, 5, 'active')).toBe('5 из 5 текущих');
    expect(formatTransactionsScopeLabel(11, 11, 'active')).toBe('11 из 11 текущих');
    expect(formatTransactionsScopeLabel(3, 21, 'active')).toBe('3 из 21 текущей');
    expect(formatTransactionsScopeLabel(3, 101, 'active')).toBe('3 из 101 текущей');
  });

  it('agrees the adjective with the total for the archived tab', () => {
    expect(formatTransactionsScopeLabel(1, 1, 'archived')).toBe('1 из 1 скрытой');
    expect(formatTransactionsScopeLabel(2, 5, 'archived')).toBe('2 из 5 скрытых');
    expect(formatTransactionsScopeLabel(0, 0, 'archived')).toBe('0 из 0 скрытых');
  });
});

describe('formatHistorySubtitle', () => {
  const base = {
    scope: 'active' as const,
    shown: 12,
    total: 12,
    needsReviewCount: 0,
    isFiltered: false,
  };

  it('leads with the corrections waiting to be made', () => {
    expect(formatHistorySubtitle({ ...base, needsReviewCount: 1 })).toBe('1 запись нужно проверить');
    expect(formatHistorySubtitle({ ...base, needsReviewCount: 2 })).toBe('2 записи нужно проверить');
    expect(formatHistorySubtitle({ ...base, needsReviewCount: 5 })).toBe('5 записей нужно проверить');
  });

  it('names the tap affordance when nothing needs a correction', () => {
    expect(formatHistorySubtitle(base)).toBe('12 записей — нажмите, чтобы поправить');
    expect(formatHistorySubtitle({ ...base, shown: 1, total: 1 })).toBe(
      '1 запись — нажмите, чтобы поправить'
    );
  });

  it('reports the visible scope once a filter hides part of the list', () => {
    expect(formatHistorySubtitle({ ...base, shown: 3, isFiltered: true })).toBe('3 из 12 текущих');
  });

  it('prefers the filtered scope over the review count — the two counts would disagree', () => {
    expect(formatHistorySubtitle({ ...base, shown: 3, needsReviewCount: 2, isFiltered: true })).toBe(
      '3 из 12 текущих'
    );
  });

  it('points an empty history at the capture that fills it', () => {
    expect(formatHistorySubtitle({ ...base, shown: 0, total: 0 })).toBe(
      'Здесь появится всё, что вы запишете'
    );
  });

  it('says out loud that hidden rows are out of the totals', () => {
    expect(formatHistorySubtitle({ ...base, scope: 'archived', shown: 1, total: 1 })).toBe(
      '1 скрытая запись — не в итогах'
    );
    expect(formatHistorySubtitle({ ...base, scope: 'archived', shown: 4, total: 4 })).toBe(
      '4 скрытых записи — не в итогах'
    );
    expect(formatHistorySubtitle({ ...base, scope: 'archived', shown: 0, total: 0 })).toBe(
      'Скрытые записи появятся здесь'
    );
  });
});
