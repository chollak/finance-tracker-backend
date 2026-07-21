import { DashboardController } from '../src/modules/dashboard/presentation/controllers/dashboardController';

function createMockResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('DashboardController validation errors', () => {
  const dashboardService = {
    getDashboardInsights: jest.fn(),
    getWeeklyInsights: jest.fn(),
    calculateFinancialHealthScore: jest.fn(),
  } as any;
  const alertService = {
    getAlertsByType: jest.fn(),
    getAlertsBySeverity: jest.fn(),
    getActiveAlerts: jest.fn(),
    getAlertSummary: jest.fn(),
  } as any;

  let controller: DashboardController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DashboardController(dashboardService, alertService);
  });

  it('maps missing userId on insights to a 400 validation error, not a 500', async () => {
    const req = { params: {}, query: {} } as any;
    const res = createMockResponse();

    await controller.getDashboardInsights(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'User ID is required',
      }),
    }));
    expect(dashboardService.getDashboardInsights).not.toHaveBeenCalled();
  });

  it('maps missing userId on quick stats to a 400 validation error, not a 500', async () => {
    const req = { params: {}, query: {} } as any;
    const res = createMockResponse();

    await controller.getQuickStats(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'User ID is required',
      }),
    }));
    expect(dashboardService.getDashboardInsights).not.toHaveBeenCalled();
    expect(alertService.getAlertSummary).not.toHaveBeenCalled();
  });
});
