import { DebtController } from '../src/modules/debt/presentation/controllers/debtController';

function createMockResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function createDebtModule() {
  return {
    createDebtUseCase: { execute: jest.fn() },
    getDebtsUseCase: {
      executeGetAll: jest.fn(),
      executeGetByType: jest.fn(),
      executeGetById: jest.fn(),
      executeGetWithPayments: jest.fn(),
      executeGetSummary: jest.fn(),
    },
    updateDebtUseCase: { execute: jest.fn(), executeCancel: jest.fn() },
    deleteDebtUseCase: { execute: jest.fn() },
    payDebtUseCase: {
      execute: jest.fn(),
      executePayFull: jest.fn(),
      executeGetPaymentById: jest.fn(),
      executeDeletePayment: jest.fn(),
    },
  } as any;
}

describe('DebtController validation errors', () => {
  let debtModule: ReturnType<typeof createDebtModule>;
  let controller: DebtController;

  beforeEach(() => {
    jest.clearAllMocks();
    debtModule = createDebtModule();
    controller = new DebtController(debtModule);
  });

  it('maps missing userId on createDebt to a 400 validation error, not a 500', async () => {
    const req = { params: {}, body: {}, query: {} } as any;
    const res = createMockResponse();

    await controller.createDebt(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'User ID is required',
      }),
    }));
    expect(debtModule.createDebtUseCase.execute).not.toHaveBeenCalled();
  });

  it('maps missing debtId on payDebtFull to a 400 validation error, not a 500', async () => {
    const req = { params: {}, body: {}, query: {} } as any;
    const res = createMockResponse();

    await controller.payDebtFull(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'Debt ID is required',
      }),
    }));
    expect(debtModule.payDebtUseCase.executePayFull).not.toHaveBeenCalled();
  });

  it('maps missing paymentId on deletePayment to a 400 validation error, not a 500', async () => {
    const req = { params: {}, body: {}, query: {} } as any;
    const res = createMockResponse();

    await controller.deletePayment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'Payment ID is required',
      }),
    }));
    expect(debtModule.payDebtUseCase.executeGetPaymentById).not.toHaveBeenCalled();
  });
});
