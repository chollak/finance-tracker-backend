import { calculateHomeTrustSummary } from '../webapp/src/widgets/home-trust-summary/lib/calculateHomeTrustSummary';

describe('calculateHomeTrustSummary', () => {
  it('separates outgoing cashflow, excluded movements, needsReview, and finalized real expenses for the current month', () => {
    const summary = calculateHomeTrustSummary([
      { amount: 25000, type: 'expense', semanticType: 'expense', needsReview: false, date: '2026-07-31', _semanticTypeLabel: 'Расход' },
      { amount: 500000, type: 'expense', semanticType: 'own_transfer', needsReview: false, date: '2026-07-31', _semanticTypeLabel: 'Перевод себе' },
      { amount: 2000000, type: 'expense', semanticType: 'saving_deposit', needsReview: false, date: '2026-07-31', _semanticTypeLabel: 'Вклад / накопление' },
      { amount: 400000, type: 'expense', semanticType: 'expense', needsReview: true, date: '2026-07-31', _semanticTypeLabel: 'Расход' },
      { amount: 7000000, type: 'income', semanticType: 'income', needsReview: false, date: '2026-07-31', _semanticTypeLabel: 'Доход' },
      { amount: 999000, type: 'expense', semanticType: 'expense', needsReview: false, date: '2026-06-30', _semanticTypeLabel: 'Расход' },
    ], '2026-07-01');

    expect(summary.outgoingTotal).toBe(2925000);
    expect(summary.excludedTotal).toBe(2500000);
    expect(summary.needsReviewTotal).toBe(400000);
    expect(summary.realExpenseTotal).toBe(25000);
    expect(summary.excludedLabels).toEqual(['Перевод себе', 'Вклад / накопление']);
    expect(summary.needsReviewCount).toBe(1);
  });

  it('never allows malformed totals to make real expenses negative', () => {
    const summary = calculateHomeTrustSummary([
      { amount: 100000, type: 'expense', semanticType: 'own_transfer', needsReview: false, date: '2026-07-31', _semanticTypeLabel: 'Перевод себе' },
    ], '2026-07-01');

    expect(summary.realExpenseTotal).toBe(0);
  });
});
