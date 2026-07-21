import { BudgetController } from '../src/modules/budget/interfaces/budgetController';

function createMockResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function createBudgetModule() {
  return {
    createBudgetUseCase: { execute: jest.fn() },
    getBudgetsUseCase: {
      executeGetAll: jest.fn(),
      executeGetActive: jest.fn(),
      executeGetById: jest.fn(),
      executeGetSummaries: jest.fn(),
    },
    updateBudgetUseCase: { execute: jest.fn() },
    deleteBudgetUseCase: { execute: jest.fn() },
    budgetService: {
      recalculateAllUserBudgets: jest.fn(),
      recalculateBudgetSpending: jest.fn(),
      getBudgetsNearLimit: jest.fn(),
      getOverBudgets: jest.fn(),
    },
  } as any;
}

describe('BudgetController validation errors', () => {
  let budgetModule: ReturnType<typeof createBudgetModule>;
  let controller: BudgetController;

  beforeEach(() => {
    jest.clearAllMocks();
    budgetModule = createBudgetModule();
    controller = new BudgetController(budgetModule);
  });

  it('maps missing userId on createBudget to a 400 validation error, not a 500', async () => {
    const req = { params: {}, body: {}, query: {} } as any;
    const res = createMockResponse();

    await controller.createBudget(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'User ID is required',
      }),
    }));
    expect(budgetModule.createBudgetUseCase.execute).not.toHaveBeenCalled();
  });

  it('maps missing userId on budget alerts to a 400 validation error, not a 500', async () => {
    const req = { params: {}, body: {}, query: {} } as any;
    const res = createMockResponse();

    await controller.getBudgetAlerts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'User ID is required',
      }),
    }));
    expect(budgetModule.budgetService.recalculateAllUserBudgets).not.toHaveBeenCalled();
  });
});
