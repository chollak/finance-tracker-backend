import { getPreviousWeekRange, summarizeWeeklyReview } from '../src/modules/transaction/application/weeklyReviewService';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    date: '2024-03-12',
    category: 'other',
    description: 'test',
    amount: 0,
    type: 'expense',
    userId: 'user-123',
    ...overrides,
  };
}

const WEEK_RANGE = {
  startDate: new Date('2024-03-11T00:00:00.000Z'),
  endDate: new Date('2024-03-17T23:59:59.999Z'),
};

describe('summarizeWeeklyReview', () => {
  it('separates real expenses, income, excluded movements, and needsReview across all semantic types', () => {
    const transactions: Transaction[] = [
      tx({ id: 'expense-1', amount: 50, category: 'food', semanticType: 'expense', type: 'expense' }),
      tx({ id: 'income-1', amount: 1000, category: 'salary', semanticType: 'income', type: 'income' }),
      tx({ id: 'own-transfer-1', amount: 200, category: 'transfer', semanticType: 'own_transfer', type: 'expense' }),
      tx({ id: 'saving-1', amount: 150, category: 'savings', semanticType: 'saving_deposit', type: 'expense' }),
      tx({ id: 'debt-1', amount: 300, category: 'debt', semanticType: 'debt', type: 'expense' }),
      tx({ id: 'reimbursement-1', amount: 80, category: 'reimbursement', semanticType: 'reimbursement', type: 'income' }),
      tx({ id: 'cash-1', amount: 100, category: 'cash', semanticType: 'cash_withdrawal', type: 'expense' }),
      tx({ id: 'group-1', amount: 60, category: 'group', semanticType: 'group_payment', type: 'expense' }),
      tx({ id: 'review-1', amount: 25, category: 'unknown', semanticType: 'expense', type: 'expense', needsReview: true }),
    ];

    const summary = summarizeWeeklyReview(transactions, WEEK_RANGE);

    expect(summary.realExpenses).toBe(50); // expense-1 only, review-1 excluded pending correction
    expect(summary.income).toBe(1000); // income-1 only, reimbursement excluded from income
    expect(summary.excludedMovementsTotal).toBe(200 + 150 + 300 + 80 + 100 + 60);
    expect(summary.excludedMovementsBreakdown).toEqual({
      own_transfer: 200,
      saving_deposit: 150,
      debt: 300,
      reimbursement: 80,
      cash_withdrawal: 100,
      group_payment: 60,
    });
    expect(summary.topCategories).toEqual([{ category: 'food', amount: 50 }]);
    expect(summary.needsReview.count).toBe(1);
    expect(summary.needsReview.total).toBe(25);
    expect(summary.needsReview.transactions.map(t => t.id)).toEqual(['review-1']);
  });

  it('excludes needsReview transactions from income when semanticType is income', () => {
    const transactions: Transaction[] = [
      tx({ id: 'income-review', amount: 500, category: 'salary', semanticType: 'income', type: 'income', needsReview: true }),
    ];

    const summary = summarizeWeeklyReview(transactions, WEEK_RANGE);

    expect(summary.income).toBe(0);
    expect(summary.needsReview.count).toBe(1);
    expect(summary.needsReview.total).toBe(500);
  });

  it('excludes needsReview transactions from excluded movements when semanticType is an excluded movement type', () => {
    const transactions: Transaction[] = [
      tx({ id: 'debt-review', amount: 300, category: 'debt', semanticType: 'debt', type: 'expense', needsReview: true }),
    ];

    const summary = summarizeWeeklyReview(transactions, WEEK_RANGE);

    expect(summary.excludedMovementsTotal).toBe(0);
    expect(summary.excludedMovementsBreakdown).toEqual({});
    expect(summary.needsReview.count).toBe(1);
    expect(summary.needsReview.total).toBe(300);
  });

  it('groups topCategories from real expenses only, excluding non-expense semantic types', () => {
    const transactions: Transaction[] = [
      tx({ id: '1', amount: 40, category: 'food', semanticType: 'expense' }),
      tx({ id: '2', amount: 60, category: 'food', semanticType: 'expense' }),
      tx({ id: '3', amount: 500, category: 'food', semanticType: 'own_transfer' }),
      tx({ id: '4', amount: 30, category: 'transport', semanticType: 'expense' }),
      tx({ id: '5', amount: 1000, category: 'income', semanticType: 'income' }),
    ];

    const summary = summarizeWeeklyReview(transactions, WEEK_RANGE);

    expect(summary.topCategories).toEqual([
      { category: 'food', amount: 100 },
      { category: 'transport', amount: 30 },
    ]);
  });

  it('falls back to legacy type when semanticType is missing', () => {
    const transactions: Transaction[] = [
      tx({ id: 'legacy-expense', amount: 45, category: 'food', type: 'expense', semanticType: undefined }),
      tx({ id: 'legacy-income', amount: 300, category: 'salary', type: 'income', semanticType: undefined }),
    ];

    const summary = summarizeWeeklyReview(transactions, WEEK_RANGE);

    expect(summary.realExpenses).toBe(45);
    expect(summary.income).toBe(300);
    expect(summary.excludedMovementsTotal).toBe(0);
    expect(summary.topCategories).toEqual([{ category: 'food', amount: 45 }]);
  });

  it('excludes transactions outside the given date range', () => {
    const transactions: Transaction[] = [
      tx({ id: 'in-range', amount: 20, date: '2024-03-13', semanticType: 'expense' }),
      tx({ id: 'before-range', amount: 999, date: '2024-03-01', semanticType: 'expense' }),
      tx({ id: 'after-range', amount: 999, date: '2024-04-01', semanticType: 'expense' }),
    ];

    const summary = summarizeWeeklyReview(transactions, WEEK_RANGE);

    expect(summary.realExpenses).toBe(20);
  });

  it('omits semantic types with no transactions from the excluded movements breakdown', () => {
    const transactions: Transaction[] = [
      tx({ id: 'debt-only', amount: 100, semanticType: 'debt' }),
    ];

    const summary = summarizeWeeklyReview(transactions, WEEK_RANGE);

    expect(summary.excludedMovementsBreakdown).toEqual({ debt: 100 });
    expect(summary.excludedMovementsTotal).toBe(100);
  });

  it('returns zeroed summary for an empty transaction list', () => {
    const summary = summarizeWeeklyReview([], WEEK_RANGE);

    expect(summary.realExpenses).toBe(0);
    expect(summary.income).toBe(0);
    expect(summary.excludedMovementsTotal).toBe(0);
    expect(summary.excludedMovementsBreakdown).toEqual({});
    expect(summary.needsReview).toEqual({ count: 0, total: 0, transactions: [] });
    expect(summary.topCategories).toEqual([]);
  });
});


describe('getPreviousWeekRange', () => {
  it('returns Monday through Sunday of the previous ISO week', () => {
    const range = getPreviousWeekRange(new Date('2026-07-31T12:00:00.000Z'));

    expect(range.startDate.toISOString()).toBe('2026-07-20T00:00:00.000Z');
    expect(range.endDate.toISOString()).toBe('2026-07-26T23:59:59.999Z');
  });

  it('works when today is Monday', () => {
    const range = getPreviousWeekRange(new Date('2026-07-27T09:00:00.000Z'));

    expect(range.startDate.toISOString()).toBe('2026-07-20T00:00:00.000Z');
    expect(range.endDate.toISOString()).toBe('2026-07-26T23:59:59.999Z');
  });
});
