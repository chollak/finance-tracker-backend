import { BudgetService } from '../src/modules/budget/application/budgetService';
import { BudgetController } from '../src/modules/budget/interfaces/budgetController';
import { BudgetPeriod, BudgetSummary } from '../src/modules/budget/domain/budgetEntity';

// FT-053: near-limit threshold scale.
// `BudgetSummary.percentageUsed` is a percent (0-100), so the near-limit threshold
// is a percent too. The public `alerts?threshold=` query keeps its legacy 0-1
// fraction meaning: 0.8 still means 80%.

function summary(percentageUsed: number, overrides: Partial<BudgetSummary> = {}): BudgetSummary {
  return {
    id: `budget-${percentageUsed}`,
    name: `Budget ${percentageUsed}`,
    amount: 1000,
    spent: percentageUsed * 10,
    remaining: 1000 - percentageUsed * 10,
    percentageUsed,
    isOverBudget: percentageUsed > 100,
    period: BudgetPeriod.MONTHLY,
    daysRemaining: 10,
    ...overrides,
  };
}

describe('BudgetService.getBudgetsNearLimit — percent scale (FT-053)', () => {
  let budgetRepository: any;
  let budgetService: BudgetService;

  beforeEach(() => {
    budgetRepository = {
      getBudgetSummaries: jest.fn(),
    };
    budgetService = new BudgetService(budgetRepository, {} as any);
  });

  it('does not report a budget used 48% as near limit', async () => {
    budgetRepository.getBudgetSummaries.mockResolvedValue([summary(48)]);

    const nearLimit = await budgetService.getBudgetsNearLimit('user-123');

    expect(nearLimit).toHaveLength(0);
  });

  it('reports a budget used 85% as near limit', async () => {
    budgetRepository.getBudgetSummaries.mockResolvedValue([summary(85)]);

    const nearLimit = await budgetService.getBudgetsNearLimit('user-123');

    expect(nearLimit.map(b => b.percentageUsed)).toEqual([85]);
  });

  it('uses 80 percent as the inclusive boundary (79 / 80 / 81)', async () => {
    budgetRepository.getBudgetSummaries.mockResolvedValue([
      summary(79),
      summary(80),
      summary(81),
    ]);

    const nearLimit = await budgetService.getBudgetsNearLimit('user-123');

    expect(nearLimit.map(b => b.percentageUsed)).toEqual([80, 81]);
  });

  it('accepts an explicit percent threshold', async () => {
    budgetRepository.getBudgetSummaries.mockResolvedValue([summary(85), summary(95)]);

    const nearLimit = await budgetService.getBudgetsNearLimit('user-123', 90);

    expect(nearLimit.map(b => b.percentageUsed)).toEqual([95]);
  });

  it('excludes budgets that are already over budget', async () => {
    budgetRepository.getBudgetSummaries.mockResolvedValue([
      summary(120, { isOverBudget: true }),
      summary(85),
    ]);

    const nearLimit = await budgetService.getBudgetsNearLimit('user-123');

    expect(nearLimit.map(b => b.percentageUsed)).toEqual([85]);
  });
});

describe('BudgetController budget alerts threshold contract (FT-053)', () => {
  function createBudgetModule() {
    return {
      budgetService: {
        recalculateAllUserBudgets: jest.fn().mockResolvedValue(undefined),
        getBudgetsNearLimit: jest.fn().mockResolvedValue([]),
        getOverBudgets: jest.fn().mockResolvedValue([]),
      },
    } as any;
  }

  function createMockResponse() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  let budgetModule: ReturnType<typeof createBudgetModule>;
  let controller: BudgetController;

  beforeEach(() => {
    jest.clearAllMocks();
    budgetModule = createBudgetModule();
    controller = new BudgetController(budgetModule);
  });

  it('defaults to 80 percent when no threshold is given', async () => {
    const req = { params: { userId: 'user-123' }, query: {} } as any;

    await controller.getBudgetAlerts(req, createMockResponse());

    expect(budgetModule.budgetService.getBudgetsNearLimit).toHaveBeenCalledWith('user-123', 80);
  });

  it('keeps the legacy 0-1 fraction meaning of ?threshold=0.8', async () => {
    const req = { params: { userId: 'user-123' }, query: { threshold: '0.8' } } as any;

    await controller.getBudgetAlerts(req, createMockResponse());

    expect(budgetModule.budgetService.getBudgetsNearLimit).toHaveBeenCalledWith('user-123', 80);
  });

  it('accepts a percent threshold above 1 as percent', async () => {
    const req = { params: { userId: 'user-123' }, query: { threshold: '90' } } as any;

    await controller.getBudgetAlerts(req, createMockResponse());

    expect(budgetModule.budgetService.getBudgetsNearLimit).toHaveBeenCalledWith('user-123', 90);
  });

  it('keeps threshold=1 as the legacy fraction meaning of 100 percent', async () => {
    const req = { params: { userId: 'user-123' }, query: { threshold: '1' } } as any;

    await controller.getBudgetAlerts(req, createMockResponse());

    expect(budgetModule.budgetService.getBudgetsNearLimit).toHaveBeenCalledWith('user-123', 100);
  });

  it('falls back to the default for an unparsable threshold', async () => {
    const req = { params: { userId: 'user-123' }, query: { threshold: 'abc' } } as any;

    await controller.getBudgetAlerts(req, createMockResponse());

    expect(budgetModule.budgetService.getBudgetsNearLimit).toHaveBeenCalledWith('user-123', 80);
  });

  it('falls back to the default for thresholds outside 0-100 percent', async () => {
    for (const threshold of ['-0.1', '150']) {
      jest.clearAllMocks();
      const req = { params: { userId: 'user-123' }, query: { threshold } } as any;

      await controller.getBudgetAlerts(req, createMockResponse());

      expect(budgetModule.budgetService.getBudgetsNearLimit).toHaveBeenCalledWith('user-123', 80);
    }
  });

  it('reports the applied threshold in percent so the scale is not implicit', async () => {
    const req = { params: { userId: 'user-123' }, query: { threshold: '0.8' } } as any;
    const res = createMockResponse();

    await controller.getBudgetAlerts(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ thresholdPercent: 80 }),
    }));
  });
});
