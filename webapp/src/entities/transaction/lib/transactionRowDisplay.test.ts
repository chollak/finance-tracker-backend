import { describe, expect, it } from 'vitest';
import { TRANSACTION_SEMANTIC_TYPES, type Transaction } from '@/shared/types';
import {
  DESCRIPTION_VISIBLE_CHARS,
  getCorrectionToggleLabel,
  shouldShowDescriptionTooltip,
  shouldShowSemanticTypeBadge,
} from './transactionRowDisplay';
import { transactionToViewModel } from './toViewModel';

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    date: '2026-09-01',
    category: 'food',
    description: 'Обед в столовой',
    amount: 50000,
    type: 'expense',
    userId: 'user-1',
    createdAt: '2026-09-02T00:31:00.000Z',
    ...overrides,
  };
}

describe('shouldShowSemanticTypeBadge', () => {
  it('hides the badge on ordinary expenses — colour and sign already say it', () => {
    expect(shouldShowSemanticTypeBadge('expense')).toBe(false);
  });

  it('keeps the badge on every other semantic type', () => {
    const others = TRANSACTION_SEMANTIC_TYPES.filter((type) => type !== 'expense');
    for (const type of others) {
      expect(shouldShowSemanticTypeBadge(type)).toBe(true);
    }
  });
});

describe('shouldShowDescriptionTooltip', () => {
  const cases: Array<[label: string, length: number, expected: boolean]> = [
    ['10 characters', 10, false],
    ['25 characters', 25, false],
    ['40 characters', 40, false],
    ['exactly the visible budget', DESCRIPTION_VISIBLE_CHARS, false],
    ['one char over the visible budget', DESCRIPTION_VISIBLE_CHARS + 1, true],
    ['80 characters', 80, true],
  ];

  it.each(cases)('%s → tooltip: %s', (_label, length, expected) => {
    expect(shouldShowDescriptionTooltip('а'.repeat(length))).toBe(expected);
  });

  it('treats missing description as fitting', () => {
    expect(shouldShowDescriptionTooltip(undefined)).toBe(false);
    expect(shouldShowDescriptionTooltip('')).toBe(false);
  });
});

describe('getCorrectionToggleLabel', () => {
  it('keeps the collapsed needs-review call to action compact and obvious', () => {
    expect(getCorrectionToggleLabel(false)).toBe('Исправить тип');
  });

  it('labels the expanded state as collapsible', () => {
    expect(getCorrectionToggleLabel(true)).toBe('Скрыть варианты');
  });
});

describe('transactionToViewModel — row badge flag', () => {
  it('hides the badge for an expense with an explicit semanticType', () => {
    const vm = transactionToViewModel(makeTransaction({ semanticType: 'expense' }));
    expect(vm._showSemanticTypeBadge).toBe(false);
    // Label stays available: search filters match on it.
    expect(vm._semanticTypeLabel).toBe('Расход');
  });

  it('hides the badge for a legacy expense without semanticType', () => {
    const vm = transactionToViewModel(makeTransaction({ semanticType: undefined }));
    expect(vm._showSemanticTypeBadge).toBe(false);
  });

  it('keeps the badge for non-expense movements', () => {
    const vm = transactionToViewModel(makeTransaction({ semanticType: 'debt' }));
    expect(vm._showSemanticTypeBadge).toBe(true);
    expect(vm._isNonExpenseMovement).toBe(true);
    expect(vm._semanticTypeLabel).toBe('Долг');
  });

  it('keeps the badge for income', () => {
    const vm = transactionToViewModel(
      makeTransaction({ type: 'income', semanticType: 'income' })
    );
    expect(vm._showSemanticTypeBadge).toBe(true);
  });

  it('keeps the needsReview flag independent of the badge rule', () => {
    const vm = transactionToViewModel(
      makeTransaction({ semanticType: 'expense', needsReview: true })
    );
    expect(vm._showSemanticTypeBadge).toBe(false);
    expect(vm._needsReview).toBe(true);
  });
});
