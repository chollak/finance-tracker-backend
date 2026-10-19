import { describe, expect, it } from 'vitest';
import { MINUS, NBSP } from '@/shared/lib/money';
import type { PeriodTotals } from '@/entities/transaction';
import { missingRateNote, summaryTiles, tileValueClass } from './summaryTiles';

/**
 * FT-111, board «Главная» (docs/pastel/components/SummaryTiles.md): income and expenses of the current
 * month from the backend's totals service, with a sign, without the unit.
 */

function totals(incomeMinor: number, expenseMinor: number): PeriodTotals {
  return {
    from: '2026-10-01',
    to: '2026-10-31',
    incomeMinor,
    expenseMinor,
    netMinor: incomeMinor - expenseMinor,
    recordCount: 0,
    needsReview: { count: 0, totalMinor: 0 },
    excludedMovementsMinor: 0,
    usd: { present: false, missingRate: false, rateMinor: null },
  };
}

describe('month tiles', () => {
  it('name the month and show income with «+» and expenses with «−»', () => {
    const [income, expense] = summaryTiles(totals(1_629_500_000, 768_440_000), 10);

    expect(income).toMatchObject({ kind: 'income', label: 'Доход за октябрь', value: `+16${NBSP}295${NBSP}000` });
    expect(expense).toMatchObject({ kind: 'expense', label: 'Расход за октябрь', value: `${MINUS}7${NBSP}684${NBSP}400` });
    expect(income.ariaLabel).toBe(`Доход за октябрь: +16${NBSP}295${NBSP}000${NBSP}сум. Открыть аналитику`);
  });

  it('show 0 when the month has nothing yet', () => {
    const [income, expense] = summaryTiles(totals(0, 0), 10);

    expect(income.value).toBe('0');
    expect(expense.value).toBe('0');
    expect(expense.ariaLabel).toBe('Расход за октябрь: пока нет. Открыть аналитику');
  });

  it('keep their labels while the totals load, without a number that reads as a result', () => {
    const [income, expense] = summaryTiles(undefined, 5);

    expect(income).toMatchObject({ label: 'Доход за май', value: null });
    expect(expense).toMatchObject({ label: 'Расход за май', value: null });
  });

  it('make a long amount smaller instead of cutting it', () => {
    expect(tileValueClass(`+16${NBSP}295${NBSP}000`)).toBe('type-tile-value');
    expect(tileValueClass(`+1${NBSP}629${NBSP}500${NBSP}000`)).toBe('type-tile-value');
    expect(tileValueClass(`+16${NBSP}295${NBSP}000${NBSP}000`)).not.toBe('type-tile-value');
  });
});

describe('missing rate', () => {
  it('the tiles say the dollars are left out while there is no rate', () => {
    const noRate = { ...totals(0, 18_000_000), usd: { present: true, missingRate: true, rateMinor: null } };

    expect(missingRateNote(noRate)).toBe('Доллары не вошли в итоги месяца: курса пока нет');
  });

  it('and say nothing when the dollars are counted, there are none or the totals are still loading', () => {
    const counted = { ...totals(0, 18_000_000), usd: { present: true, missingRate: false, rateMinor: 1_265_000 } };

    expect(missingRateNote(counted)).toBeNull();
    expect(missingRateNote(totals(0, 0))).toBeNull();
    expect(missingRateNote(undefined)).toBeNull();
  });
});
