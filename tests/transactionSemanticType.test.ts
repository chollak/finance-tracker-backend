import {
  TRANSACTION_SEMANTIC_TYPES,
  isTransactionSemanticType,
  normalizeSemanticType,
  countsAsRealExpense,
  countsAsBudgetSpending,
  countsAsIncome,
} from '../src/modules/transaction/domain/transactionSemanticType';

describe('isTransactionSemanticType', () => {
  it('accepts every value in TRANSACTION_SEMANTIC_TYPES', () => {
    for (const value of TRANSACTION_SEMANTIC_TYPES) {
      expect(isTransactionSemanticType(value)).toBe(true);
    }
  });

  it('rejects unknown strings and non-strings', () => {
    expect(isTransactionSemanticType('crypto_trade')).toBe(false);
    expect(isTransactionSemanticType(undefined)).toBe(false);
    expect(isTransactionSemanticType(null)).toBe(false);
    expect(isTransactionSemanticType(123)).toBe(false);
  });
});

describe('normalizeSemanticType', () => {
  it('returns the value as-is when it is already a valid semantic type', () => {
    expect(normalizeSemanticType('own_transfer', 'expense')).toBe('own_transfer');
    expect(normalizeSemanticType('saving_deposit', 'income')).toBe('saving_deposit');
  });

  it('falls back to "expense" for an unknown value when legacy type is expense', () => {
    expect(normalizeSemanticType(undefined, 'expense')).toBe('expense');
    expect(normalizeSemanticType('crypto_trade', 'expense')).toBe('expense');
  });

  it('falls back to "income" for an unknown value when legacy type is income', () => {
    expect(normalizeSemanticType(undefined, 'income')).toBe('income');
    expect(normalizeSemanticType('crypto_trade', 'income')).toBe('income');
  });

  it('coerces legacy income transactions away from a stale expense semantic type', () => {
    expect(normalizeSemanticType('expense', 'income')).toBe('income');
  });

  it('defaults to "expense" when no fallbackType is provided and value is unknown', () => {
    expect(normalizeSemanticType(undefined)).toBe('expense');
  });
});

describe('countsAsRealExpense', () => {
  it('only "expense" counts as a real expense', () => {
    expect(countsAsRealExpense('expense')).toBe(true);
    expect(countsAsRealExpense('income')).toBe(false);
    expect(countsAsRealExpense('own_transfer')).toBe(false);
    expect(countsAsRealExpense('saving_deposit')).toBe(false);
    expect(countsAsRealExpense('debt')).toBe(false);
    expect(countsAsRealExpense('reimbursement')).toBe(false);
    expect(countsAsRealExpense('cash_withdrawal')).toBe(false);
    expect(countsAsRealExpense('group_payment')).toBe(false);
    expect(countsAsRealExpense(undefined)).toBe(false);
  });
});

describe('countsAsBudgetSpending', () => {
  it('only "expense" counts as budget spending', () => {
    expect(countsAsBudgetSpending('expense')).toBe(true);
    expect(countsAsBudgetSpending('own_transfer')).toBe(false);
    expect(countsAsBudgetSpending('saving_deposit')).toBe(false);
    expect(countsAsBudgetSpending('debt')).toBe(false);
    expect(countsAsBudgetSpending(undefined)).toBe(false);
  });
});

describe('countsAsIncome', () => {
  it('only "income" counts as income', () => {
    expect(countsAsIncome('income')).toBe(true);
    expect(countsAsIncome('expense')).toBe(false);
    expect(countsAsIncome('reimbursement')).toBe(false);
    expect(countsAsIncome(undefined)).toBe(false);
  });
});
