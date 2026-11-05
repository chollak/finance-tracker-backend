import { summarizePeriod } from '../src/modules/transaction/domain/periodTotals';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';

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

  it('period totals (Home, analytics, the bot\'s summaries)', () => {
    const totals = summarizePeriod([...tenCoffees, salary], { usdRateMinor: null });

    expect(totals).toMatchObject({ expenseMinor: 100, incomeMinor: 30, netMinor: -70 });
    expect(totals.categories).toEqual([expect.objectContaining({ category: 'coffee', amountMinor: 100, count: 10, percentage: 100 })]);
  });

  it('reads records that carry only the legacy amount', () => {
    const legacy = { ...tx({}), amountMinor: undefined, amount: 25000 };

    expect(summarizePeriod([legacy], { usdRateMinor: null }).expenseMinor).toBe(2_500_000);
  });
});
