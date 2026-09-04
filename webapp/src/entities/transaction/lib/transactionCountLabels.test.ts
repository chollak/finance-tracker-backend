import { describe, it, expect } from 'vitest';
import { formatAllTransactionsLabel, formatTransactionsScopeLabel } from './transactionCountLabels';

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
