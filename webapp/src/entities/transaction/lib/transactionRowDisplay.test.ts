import { describe, expect, it } from 'vitest';
import { TRANSACTION_SEMANTIC_TYPES, type Transaction } from '@/shared/types';
import {
  DESCRIPTION_VISIBLE_CHARS,
  formatCompactRowAriaLabel,
  formatCompactRowDayLabel,
  formatCompactRowMeta,
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

// Fixed «now» so the day marker is asserted against a date, not against the clock.
const NOW = new Date(2026, 8, 4, 14, 30); // 2026-09-04

describe('formatCompactRowDayLabel', () => {
  it('shows nothing for today — the common case right after a capture', () => {
    expect(formatCompactRowDayLabel('2026-09-04', NOW)).toBeNull();
  });

  it('names yesterday', () => {
    expect(formatCompactRowDayLabel('2026-09-03', NOW)).toBe('Вчера');
  });

  it('shows day and month inside the current year', () => {
    expect(formatCompactRowDayLabel('2026-08-29', NOW)).toBe('29 авг.');
  });

  it('adds the year once the date leaves the current one', () => {
    expect(formatCompactRowDayLabel('2025-12-31', NOW)).toBe('31 дек. 2025');
  });

  it('ignores the time of day when deciding «today»', () => {
    expect(formatCompactRowDayLabel('2026-09-04T23:59:00.000Z', new Date(2026, 8, 4, 0, 1))).toBeNull();
  });

  it('returns nothing for an unparseable date instead of rendering «Invalid Date»', () => {
    expect(formatCompactRowDayLabel('not-a-date', NOW)).toBeNull();
  });
});

describe('formatCompactRowMeta', () => {
  it('shows only the category for a same-day expense — sign and colour say the rest', () => {
    const vm = transactionToViewModel(
      makeTransaction({ date: '2026-09-04', semanticType: 'expense' })
    );
    expect(formatCompactRowMeta(vm, NOW)).toBe('Еда');
  });

  it('shows only the category for income — the green plus already says «доход»', () => {
    const vm = transactionToViewModel(
      makeTransaction({ date: '2026-09-04', type: 'income', category: 'salary', semanticType: 'income' })
    );
    expect(formatCompactRowMeta(vm, NOW)).toBe('Зарплата');
  });

  it('names the movement when the amount is deliberately neutral', () => {
    const vm = transactionToViewModel(
      makeTransaction({ date: '2026-09-04', semanticType: 'own_transfer' })
    );
    expect(vm._amountColor).toBe('text-muted-foreground');
    expect(formatCompactRowMeta(vm, NOW)).toBe('Еда · Перевод себе');
  });

  it('appends the day for rows the list can no longer place by position', () => {
    const vm = transactionToViewModel(
      makeTransaction({ date: '2026-09-03', semanticType: 'cash_withdrawal' })
    );
    expect(formatCompactRowMeta(vm, NOW)).toBe('Еда · Наличные · Вчера');
  });

  it('falls back to the raw category id for an unknown category', () => {
    const vm = transactionToViewModel(
      makeTransaction({ date: '2026-09-04', category: 'quantum-snacks' })
    );
    expect(formatCompactRowMeta(vm, NOW)).toBe('quantum-snacks');
  });
});

describe('formatCompactRowAriaLabel', () => {
  it('names what the two visible lines carry: the row opens an edit screen', () => {
    const vm = transactionToViewModel(makeTransaction());
    expect(formatCompactRowAriaLabel(vm)).toBe(
      `Изменить: Обед в столовой, ${vm._formattedAmount}`
    );
  });

  it('announces a row that still awaits a correction', () => {
    const vm = transactionToViewModel(makeTransaction({ needsReview: true }));
    expect(formatCompactRowAriaLabel(vm)).toBe(
      `Изменить: Обед в столовой, ${vm._formattedAmount}, нужно проверить`
    );
  });

  it('uses the category when the description is empty', () => {
    const vm = transactionToViewModel(makeTransaction({ description: '   ' }));
    expect(formatCompactRowAriaLabel(vm)).toBe(`Изменить: Еда, ${vm._formattedAmount}`);
  });
});
