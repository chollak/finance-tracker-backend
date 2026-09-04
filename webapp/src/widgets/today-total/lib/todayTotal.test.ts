import { describe, expect, it } from 'vitest';
import {
  calculateTodayTotal,
  formatTodayTotalMeta,
  type TodayTotalTransaction,
} from './todayTotal';

// 2026-09-04, 18:00 local — the "now" every case is measured against.
const NOW = new Date(2026, 8, 4, 18, 0, 0);
const TODAY = '2026-09-04';
const YESTERDAY = '2026-09-03';

function tx(overrides: Partial<TodayTotalTransaction> = {}): TodayTotalTransaction {
  return {
    amount: 10_000,
    type: 'expense',
    semanticType: 'expense',
    date: TODAY,
    ...overrides,
  };
}

describe('calculateTodayTotal', () => {
  it('counts a real expense recorded today', () => {
    const summary = calculateTodayTotal([tx({ amount: 66_000 })], NOW);

    expect(summary.total).toBe(66_000);
    expect(summary.count).toBe(1);
    expect(summary.excludedCount).toBe(0);
  });

  it('sums several real expenses of the same day', () => {
    const summary = calculateTodayTotal(
      [tx({ amount: 66_000 }), tx({ amount: 11_000 }), tx({ amount: 5_000 })],
      NOW
    );

    expect(summary.total).toBe(82_000);
    expect(summary.count).toBe(3);
  });

  it('excludes income', () => {
    const summary = calculateTodayTotal(
      [tx({ amount: 2_000_000, type: 'income', semanticType: 'income' })],
      NOW
    );

    expect(summary).toMatchObject({ total: 0, count: 0, excludedCount: 0 });
  });

  it('excludes an own transfer', () => {
    const summary = calculateTodayTotal([tx({ semanticType: 'own_transfer' })], NOW);

    expect(summary).toMatchObject({ total: 0, count: 0, excludedCount: 1 });
  });

  it('excludes a savings deposit', () => {
    const summary = calculateTodayTotal([tx({ semanticType: 'saving_deposit' })], NOW);

    expect(summary).toMatchObject({ total: 0, count: 0, excludedCount: 1 });
  });

  it('excludes a cash withdrawal', () => {
    const summary = calculateTodayTotal([tx({ semanticType: 'cash_withdrawal' })], NOW);

    expect(summary).toMatchObject({ total: 0, count: 0, excludedCount: 1 });
  });

  it('excludes a debt movement', () => {
    const summary = calculateTodayTotal([tx({ semanticType: 'debt' })], NOW);

    expect(summary).toMatchObject({ total: 0, count: 0, excludedCount: 1 });
  });

  it('excludes a reimbursement and a group payment', () => {
    const summary = calculateTodayTotal(
      [tx({ semanticType: 'reimbursement' }), tx({ semanticType: 'group_payment' })],
      NOW
    );

    expect(summary).toMatchObject({ total: 0, count: 0, excludedCount: 2 });
  });

  it('excludes a row still waiting for a correction', () => {
    const summary = calculateTodayTotal([tx({ needsReview: true })], NOW);

    expect(summary).toMatchObject({ total: 0, count: 0, excludedCount: 1 });
  });

  it('excludes an archived row without reporting it as left out', () => {
    const summary = calculateTodayTotal([tx({ isArchived: true })], NOW);

    expect(summary).toMatchObject({ total: 0, count: 0, excludedCount: 0 });
  });

  it("excludes yesterday's expense", () => {
    const summary = calculateTodayTotal([tx({ date: YESTERDAY })], NOW);

    expect(summary).toMatchObject({ total: 0, count: 0, excludedCount: 0 });
  });

  it('counts a legacy row that predates semanticType as an expense', () => {
    const summary = calculateTodayTotal([tx({ amount: 7_000, semanticType: undefined })], NOW);

    expect(summary).toMatchObject({ total: 7_000, count: 1 });
  });

  it('reads a local ISO datetime as the same local day', () => {
    const summary = calculateTodayTotal([tx({ date: '2026-09-04T23:30:00+05:00' })], NOW);

    expect(summary.count).toBe(1);
  });

  it('keeps only real expenses out of a mixed day', () => {
    const summary = calculateTodayTotal(
      [
        tx({ amount: 66_000 }),
        tx({ amount: 11_000 }),
        tx({ amount: 500_000, semanticType: 'own_transfer' }),
        tx({ amount: 300_000, type: 'income', semanticType: 'income' }),
        tx({ amount: 40_000, needsReview: true }),
        tx({ amount: 90_000, isArchived: true }),
        tx({ amount: 25_000, date: YESTERDAY }),
      ],
      NOW
    );

    expect(summary).toMatchObject({ total: 77_000, count: 2, excludedCount: 2 });
  });

  it('reports the most recent counted row, ignoring order', () => {
    const summary = calculateTodayTotal(
      [
        tx({ createdAt: '2026-09-04T09:00:00.000Z' }),
        tx({ createdAt: '2026-09-04T09:32:40.000Z' }),
        tx({ createdAt: '2026-09-04T07:11:52.000Z' }),
      ],
      NOW
    );

    expect(summary.lastAt).toBe('2026-09-04T09:32:40.000Z');
  });

  it('does not take the last time from an excluded row', () => {
    const summary = calculateTodayTotal(
      [
        tx({ createdAt: '2026-09-04T09:00:00.000Z' }),
        tx({ semanticType: 'own_transfer', createdAt: '2026-09-04T10:00:00.000Z' }),
      ],
      NOW
    );

    expect(summary.lastAt).toBe('2026-09-04T09:00:00.000Z');
  });

  it('returns an empty summary for an empty list', () => {
    expect(calculateTodayTotal([], NOW)).toEqual({
      total: 0,
      count: 0,
      excludedCount: 0,
      lastAt: null,
    });
  });
});

describe('formatTodayTotalMeta', () => {
  it('says nothing when the day is empty', () => {
    expect(formatTodayTotalMeta({ total: 0, count: 0, excludedCount: 0, lastAt: null })).toBeNull();
  });

  it('agrees the operation count with the numeral', () => {
    expect(formatTodayTotalMeta({ total: 1, count: 1, excludedCount: 0, lastAt: null })).toBe(
      '1 операция'
    );
    expect(formatTodayTotalMeta({ total: 1, count: 3, excludedCount: 0, lastAt: null })).toBe(
      '3 операции'
    );
    expect(formatTodayTotalMeta({ total: 1, count: 5, excludedCount: 0, lastAt: null })).toBe(
      '5 операций'
    );
  });

  it('adds the local time of the last operation', () => {
    const localNoon = new Date(2026, 8, 4, 14, 20, 0).toISOString();

    expect(formatTodayTotalMeta({ total: 1, count: 3, excludedCount: 0, lastAt: localNoon })).toBe(
      '3 операции · последняя 14:20'
    );
  });

  it('mentions same-day rows left out of the total', () => {
    expect(formatTodayTotalMeta({ total: 0, count: 0, excludedCount: 1, lastAt: null })).toBe(
      '0 операций · 1 не в счёт'
    );
  });
});
