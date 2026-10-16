import { describe, expect, it } from 'vitest';
import {
  formatDayGroupExpenseTotal,
  formatDayGroupNote,
  summarizeDayGroup,
  type DayGroupTransaction,
} from './dayGroupSummary';

/**
 * `Intl.NumberFormat('ru-RU')` glues a currency together with U+00A0, not a plain
 * space — both between thousands and before the code: `185⍽000⍽UZS`. That is correct
 * and deliberate (a no-break space is what stops «185 000» from wrapping mid-number),
 * so the expectations name the character instead of the formatter dropping it.
 *
 * Spelled out as a constant on purpose: a literal U+00A0 pasted into an expectation is
 * invisible, and a mismatch against it prints a diff of two strings that look identical.
 */
const NBSP = '\u00A0';

function expense(amount: number, overrides: Partial<DayGroupTransaction> = {}): DayGroupTransaction {
  return { amount, type: 'expense', semanticType: 'expense', ...overrides };
}

function income(amount: number, overrides: Partial<DayGroupTransaction> = {}): DayGroupTransaction {
  return { amount, type: 'income', semanticType: 'income', ...overrides };
}

describe('summarizeDayGroup', () => {
  it('leaves a dollar record out of the сум totals (FT-103)', () => {
    const summary = summarizeDayGroup([
      { amount: 25_000, type: 'expense', semanticType: 'expense' },
      { amount: 55, currency: 'USD', type: 'expense', semanticType: 'expense' },
    ]);

    expect(summary.realExpenseTotal).toBe(25_000);
    expect(summary.realExpenseCount).toBe(1);
    expect(summary.excludedCount).toBe(1);
  });

  it('sums ordinary expenses', () => {
    const summary = summarizeDayGroup([expense(50000), expense(135000)]);

    expect(summary.realExpenseTotal).toBe(185000);
    expect(summary.realExpenseCount).toBe(2);
    expect(summary.excludedCount).toBe(0);
    expect(summary.needsReviewCount).toBe(0);
  });

  it('treats a row without semanticType as an ordinary expense, like the backend does', () => {
    const summary = summarizeDayGroup([expense(20000, { semanticType: undefined })]);

    expect(summary.realExpenseTotal).toBe(20000);
    expect(summary.realExpenseCount).toBe(1);
  });

  it('keeps movements that are not spending out of the expense total', () => {
    const summary = summarizeDayGroup([
      expense(50000),
      expense(300000, { semanticType: 'own_transfer' }),
      expense(200000, { semanticType: 'saving_deposit' }),
      expense(100000, { semanticType: 'cash_withdrawal' }),
      expense(400000, { semanticType: 'debt' }),
      expense(70000, { semanticType: 'reimbursement' }),
      expense(60000, { semanticType: 'group_payment' }),
    ]);

    expect(summary.realExpenseTotal).toBe(50000);
    expect(summary.realExpenseCount).toBe(1);
    expect(summary.excludedCount).toBe(6);
  });

  it('reports income separately instead of netting it against expenses', () => {
    const summary = summarizeDayGroup([expense(50000), income(2000000)]);

    expect(summary.realExpenseTotal).toBe(50000);
    expect(summary.incomeTotal).toBe(2000000);
    expect(summary.incomeCount).toBe(1);
  });

  it('holds rows awaiting a correction out of both totals', () => {
    const summary = summarizeDayGroup([
      expense(50000),
      expense(999000, { needsReview: true }),
      income(777000, { needsReview: true }),
    ]);

    expect(summary.realExpenseTotal).toBe(50000);
    expect(summary.incomeTotal).toBe(0);
    expect(summary.needsReviewCount).toBe(2);
    // A needsReview row is counted once — as work to do, not also as an exclusion.
    expect(summary.excludedCount).toBe(0);
  });

  it('normalizes a negative stored amount instead of subtracting it', () => {
    const summary = summarizeDayGroup([expense(-50000)]);

    expect(summary.realExpenseTotal).toBe(50000);
  });

  it('returns zeroes for an empty day', () => {
    expect(summarizeDayGroup([])).toEqual({
      realExpenseTotal: 0,
      realExpenseCount: 0,
      incomeTotal: 0,
      incomeCount: 0,
      excludedCount: 0,
      needsReviewCount: 0,
    });
  });
});

describe('formatDayGroupExpenseTotal', () => {
  it('names the number so it cannot be read as a net day total', () => {
    const summary = summarizeDayGroup([expense(50000), expense(135000)]);

    expect(formatDayGroupExpenseTotal(summary)).toBe(`Расходы 185${NBSP}000${NBSP}UZS`);
  });

  it('shows nothing when the day has no real spending', () => {
    const summary = summarizeDayGroup([
      expense(300000, { semanticType: 'own_transfer' }),
      income(2000000),
    ]);

    expect(formatDayGroupExpenseTotal(summary)).toBeNull();
  });
});

describe('formatDayGroupNote', () => {
  it('stays silent when the total already tells the whole day', () => {
    expect(formatDayGroupNote(summarizeDayGroup([expense(50000)]))).toBeNull();
    expect(formatDayGroupNote(summarizeDayGroup([]))).toBeNull();
  });

  it('names the income the expense total deliberately excludes', () => {
    const summary = summarizeDayGroup([expense(50000), income(2000000)]);

    expect(formatDayGroupNote(summary)).toBe(`доход 2${NBSP}000${NBSP}000${NBSP}UZS`);
  });

  it('counts movements that are not spending, so a quiet day never looks empty', () => {
    const summary = summarizeDayGroup([
      expense(300000, { semanticType: 'own_transfer' }),
      expense(100000, { semanticType: 'cash_withdrawal' }),
    ]);

    expect(formatDayGroupNote(summary)).toBe('2 не в счёт');
  });

  it('agrees the review count with the numeral', () => {
    expect(formatDayGroupNote(summarizeDayGroup([expense(1, { needsReview: true })]))).toBe(
      '1 запись на проверку'
    );
    expect(
      formatDayGroupNote(
        summarizeDayGroup([
          expense(1, { needsReview: true }),
          expense(2, { needsReview: true }),
        ])
      )
    ).toBe('2 записи на проверку');
    expect(
      formatDayGroupNote(
        summarizeDayGroup(Array.from({ length: 5 }, () => expense(1, { needsReview: true })))
      )
    ).toBe('5 записей на проверку');
  });

  it('joins every omission in one line', () => {
    const summary = summarizeDayGroup([
      expense(50000),
      income(2000000),
      expense(300000, { semanticType: 'own_transfer' }),
      expense(999000, { needsReview: true }),
    ]);

    expect(formatDayGroupNote(summary)).toBe(
      `доход 2${NBSP}000${NBSP}000${NBSP}UZS · 1 не в счёт · 1 запись на проверку`
    );
  });
});
