import { describe, it, expect } from 'vitest';
import { deriveTransactionType, MANUAL_SEMANTIC_TYPES } from './deriveTransactionType';
import { TRANSACTION_SEMANTIC_TYPES } from '@/shared/types';

/**
 * The form asks once what kind of movement this is. Direction follows from
 * that answer, so it is never asked separately — two questions about the same
 * thing can contradict each other.
 */
describe('deriveTransactionType', () => {
  it('treats money coming in as income', () => {
    expect(deriveTransactionType('income')).toBe('income');
    expect(deriveTransactionType('reimbursement')).toBe('income');
  });

  it('treats everything else as leaving the account', () => {
    for (const type of ['expense', 'own_transfer', 'saving_deposit', 'cash_withdrawal', 'debt', 'group_payment'] as const) {
      expect(deriveTransactionType(type), type).toBe('expense');
    }
  });

  it('answers for every semantic type there is', () => {
    for (const type of TRANSACTION_SEMANTIC_TYPES) {
      expect(['income', 'expense'], type).toContain(deriveTransactionType(type));
    }
  });
});

describe('MANUAL_SEMANTIC_TYPES', () => {
  it('offers every semantic type the product knows', () => {
    expect([...MANUAL_SEMANTIC_TYPES].sort()).toEqual([...TRANSACTION_SEMANTIC_TYPES].sort());
  });

  it('starts with the everyday case so the common path needs no thought', () => {
    expect(MANUAL_SEMANTIC_TYPES[0]).toBe('expense');
    expect(MANUAL_SEMANTIC_TYPES[1]).toBe('income');
  });
});
