import { AnalyticsService } from '../src/modules/transaction/application/analyticsService';
import { summarizePeriod } from '../src/modules/transaction/domain/periodTotals';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { TransactionRepository } from '../src/modules/transaction/domain/transactionRepository';

/** FT-097: readers sum integer minor units, so ten coffees at 0.10 are exactly 1.00. */
describe('totals in minor units (FT-097)', () => {
  const tx = (overrides: Partial<Transaction>): Transaction => ({
    id: Math.random().toString(36),
    userId: 'user-1',
    date: '2026-10-14',
    category: 'coffee',
    description: 'x',
    type: 'expense',
    semanticType: 'expense',
    amount: 0.1,
    amountMinor: 10,
    ...overrides,
  });

  const tenCoffees = Array.from({ length: 10 }, () => tx({}));
  const salary = tx({ type: 'income', semanticType: 'income', category: 'salary', amount: 0.3, amountMinor: 30 });

  it('analytics summary and category breakdown', async () => {
    const repository = {
      findByUserId: jest.fn().mockResolvedValue([...tenCoffees, salary]),
    } as unknown as TransactionRepository;
    const analytics = new AnalyticsService(repository);

    const summary = await analytics.getAnalyticsSummary('user-1');
    expect(summary).toMatchObject({ totalIncome: 0.3, totalExpense: 1, netIncome: -0.7 });

    const breakdown = await analytics.getDetailedCategoryBreakdown('user-1');
    expect(breakdown.coffee).toEqual({ amount: 1, count: 10, percentage: 100 });
  });

  it('period totals (Home, analytics, the bot\'s summaries)', () => {
    const totals = summarizePeriod([...tenCoffees, salary], { usdRateMinor: null });

    expect(totals.expenseMinor).toBe(100);
    expect(totals.incomeMinor).toBe(30);
    expect(totals.categories).toEqual([expect.objectContaining({ category: 'coffee', amountMinor: 100, count: 10 })]);
  });

  it('reads records that carry only the legacy amount', async () => {
    const legacy = { ...tx({}), amountMinor: undefined, amount: 25000 };
    const repository = { findByUserId: jest.fn().mockResolvedValue([legacy]) } as unknown as TransactionRepository;

    const summary = await new AnalyticsService(repository).getAnalyticsSummary('user-1');
    expect(summary.totalExpense).toBe(25000);
  });
});
