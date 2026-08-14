import { BudgetService } from '../src/modules/budget/application/budgetService';
import { BudgetRepository } from '../src/modules/budget/domain/budgetRepository';
import { TransactionRepository } from '../src/modules/transaction/domain/transactionRepository';

/**
 * The HTTP contract takes the threshold as a fraction (?threshold=0.8) while
 * summaries report percentageUsed on a 0..100 scale. Comparing them directly
 * made any budget above 0.8% "near its limit".
 */
function buildService(summaries: any[]): BudgetService {
  const budgetRepository = {
    findById: jest.fn(),
    updateSpentAmount: jest.fn(),
    findActiveByUserId: jest.fn().mockResolvedValue([]),
    getBudgetSummaries: jest.fn().mockResolvedValue(summaries),
  } as unknown as BudgetRepository;

  const transactionRepository = {
    getByUserIdAndDateRange: jest.fn().mockResolvedValue([]),
  } as unknown as TransactionRepository;

  return new BudgetService(budgetRepository, transactionRepository, () => new Date('2026-08-14T00:00:00.000Z'));
}

const summary = (percentageUsed: number, isOverBudget = false) => ({
  id: `b-${percentageUsed}`,
  name: `Бюджет ${percentageUsed}`,
  amount: 100_000,
  spent: percentageUsed * 1_000,
  remaining: 100_000 - percentageUsed * 1_000,
  percentageUsed,
  isOverBudget,
});

describe('getBudgetsNearLimit threshold scale', () => {
  it('leaves a budget well below the threshold alone', async () => {
    const service = buildService([summary(48)]);

    await expect(service.getBudgetsNearLimit('u1')).resolves.toHaveLength(0);
  });

  it('flags a budget above the threshold', async () => {
    const service = buildService([summary(85)]);

    const nearLimit = await service.getBudgetsNearLimit('u1');
    expect(nearLimit).toHaveLength(1);
  });

  it('treats the default threshold as 80 percent', async () => {
    const service = buildService([summary(79), summary(80), summary(81)]);

    const flagged = (await service.getBudgetsNearLimit('u1')).map((b: any) => b.percentageUsed);
    expect(flagged).toEqual([80, 81]);
  });

  it('honours an explicit threshold, still expressed as a fraction', async () => {
    const service = buildService([summary(48), summary(55)]);

    const flagged = (await service.getBudgetsNearLimit('u1', 0.5)).map((b: any) => b.percentageUsed);
    expect(flagged).toEqual([55]);
  });

  it('does not report an already exceeded budget as merely near its limit', async () => {
    const service = buildService([summary(120, true)]);

    await expect(service.getBudgetsNearLimit('u1')).resolves.toHaveLength(0);
  });
});
