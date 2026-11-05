import { PeriodTotalsService } from '../src/modules/transaction/application/periodTotalsService';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';

/**
 * The rules `tests/analytics.test.ts` checked on the old `AnalyticsService` (gone in #273), on the one service every
 * reader sums through — Home, History, analytics, the bot's summaries (FT-103). Dollars at the user's rate are in
 * `recordAccountCurrency.test.ts` («totals in сум»).
 */
describe('period totals keep the rules of the old analytics (#273)', () => {
  const service = new PeriodTotalsService();
  let next = 0;
  const tx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${++next}`, userId: 'user-1', date: '2026-10-14', category: 'Кафе', description: 'x',
    type: 'expense', semanticType: 'expense', amount: 500, amountMinor: 50_000, ...overrides,
  });

  it('counts only real expenses and income: movements of own money and a reimbursement are apart', async () => {
    const totals = await service.summarize('user-1', [
      tx({}),
      tx({ semanticType: 'own_transfer', amountMinor: 500_000 }),
      tx({ semanticType: 'saving_deposit', amountMinor: 300_000 }),
      tx({ semanticType: 'debt', amountMinor: 200_000 }),
      tx({ semanticType: 'cash_withdrawal', amountMinor: 100_000 }),
      tx({ semanticType: 'group_payment', amountMinor: 150_000 }),
      tx({ type: 'income', semanticType: 'reimbursement', amountMinor: 80_000 }),
    ]);

    expect(totals).toMatchObject({ expenseMinor: 50_000, incomeMinor: 0, recordCount: 7 });
    expect(totals.categories.map(category => [category.category, category.amountMinor])).toEqual([['Кафе', 50_000]]);
    expect(totals.excludedMovements).toEqual({
      totalMinor: 1_330_000,
      bySemanticType: {
        own_transfer: 500_000, saving_deposit: 300_000, debt: 200_000, cash_withdrawal: 100_000, group_payment: 150_000,
        reimbursement: 80_000,
      },
    });
  });

  it('a record without a semanticType counts by its type, as old records do', async () => {
    const totals = await service.summarize('user-1', [
      tx({ semanticType: undefined, amountMinor: 10_000 }),
      tx({ semanticType: undefined, type: 'income', category: 'Зарплата', amountMinor: 90_000 }),
    ]);

    expect(totals).toMatchObject({ expenseMinor: 10_000, incomeMinor: 90_000 });
    expect(totals.categories.map(category => [category.category, category.percentage])).toEqual([['Кафе', 100]]);
  });

  it('records awaiting review are counted apart, an expense and an income alike', async () => {
    const totals = await service.summarize('user-1', [
      tx({ amountMinor: 5_000 }),
      tx({ amountMinor: 30_000, needsReview: true }),
      tx({ type: 'income', semanticType: 'income', category: 'Зарплата', amountMinor: 20_000, needsReview: true }),
      tx({ type: 'income', semanticType: 'income', category: 'Зарплата', amountMinor: 10_000 }),
    ]);

    expect(totals).toMatchObject({ expenseMinor: 5_000, incomeMinor: 10_000 });
    expect(totals.needsReview).toMatchObject({ count: 2, totalMinor: 50_000 });
    expect(totals.categories.map(category => [category.category, category.count])).toEqual([['Кафе', 1]]);
    expect(totals.incomeCategories.map(category => [category.category, category.count])).toEqual([['Зарплата', 1]]);
  });

  it('categories are shares of real expenses only: they add up to 100 and to the expense total (FT-052)', async () => {
    const totals = await service.summarize('user-1', [
      tx({ category: 'Продукты', amountMinor: 32_500_000 }),
      tx({ category: 'Транспорт', amountMinor: 17_500_000 }),
      tx({ category: 'Другое', semanticType: 'own_transfer', amountMinor: 500_000_000 }),
      tx({ category: 'Покупки', amountMinor: 83_000_000, needsReview: true }),
      tx({ category: 'Зарплата', type: 'income', semanticType: 'income', amountMinor: 1_200_000_000 }),
    ]);

    expect(totals.categories.map(category => [category.category, category.percentage])).toEqual([['Продукты', 65], ['Транспорт', 35]]);
    expect(totals.categories.reduce((sum, category) => sum + category.amountMinor, 0)).toBe(totals.expenseMinor);
  });
});
