import express, { Express } from 'express';
import { AddressInfo } from 'net';
import http from 'http';

import {
  errorHandler,
  notFoundHandler,
  requestLogger,
  corsHeaders,
  securityHeaders,
} from '../src/delivery/web/express/middleware/errorMiddleware';
import { createTransactionRouter } from '../src/modules/transaction/presentation/controllers/transactionController';
import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { GetTransactionsUseCase } from '../src/modules/transaction/application/getTransactions';
import { AnalyticsService } from '../src/modules/transaction/application/analyticsService';
import { GetUserTransactionsUseCase } from '../src/modules/transaction/application/getUserTransactions';
import { GetTransactionByIdUseCase } from '../src/modules/transaction/application/getTransactionById';
import { DeleteTransactionUseCase } from '../src/modules/transaction/application/deleteTransaction';
import { UpdateTransactionUseCase } from '../src/modules/transaction/application/updateTransaction';
import { UpdateTransactionWithLearningUseCase } from '../src/modules/transaction/application/updateTransactionWithLearning';
import { ArchiveTransactionUseCase } from '../src/modules/transaction/application/archiveTransaction';
import { UnarchiveTransactionUseCase } from '../src/modules/transaction/application/unarchiveTransaction';
import { ArchiveMultipleTransactionsUseCase } from '../src/modules/transaction/application/archiveMultipleTransactions';
import { ArchiveAllByUserUseCase } from '../src/modules/transaction/application/archiveAllByUser';
import { GetArchivedTransactionsUseCase } from '../src/modules/transaction/application/getArchivedTransactions';
import { NotFoundError } from '../src/shared/domain/errors/AppError';

function buildTransactionTestApp() {
  const router = express.Router();

  router.use(requestLogger);
  router.use(securityHeaders);
  router.use(corsHeaders);
  router.use(express.json({ limit: '10mb' }));
  router.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const createUseCase = { execute: jest.fn() } as unknown as CreateTransactionUseCase;
  const getUseCase = { execute: jest.fn() } as unknown as GetTransactionsUseCase;
  const analyticsService = {
    getSummary: jest.fn(),
    getCategoryBreakdown: jest.fn(),
    getAnalyticsSummary: jest.fn(),
    getDetailedCategoryBreakdown: jest.fn(),
    getMonthlyTrends: jest.fn(),
    getSpendingPatterns: jest.fn(),
    getTopCategories: jest.fn(),
  } as unknown as AnalyticsService;
  const getUserUseCase = { execute: jest.fn() } as unknown as GetUserTransactionsUseCase;
  const getByIdUseCase = { execute: jest.fn() } as unknown as GetTransactionByIdUseCase;
  const deleteUseCase = { execute: jest.fn() } as unknown as DeleteTransactionUseCase;
  const updateUseCase = { execute: jest.fn() } as unknown as UpdateTransactionUseCase;
  const updateWithLearningUseCase = { execute: jest.fn() } as unknown as UpdateTransactionWithLearningUseCase;
  const archiveUseCase = { execute: jest.fn() } as unknown as ArchiveTransactionUseCase;
  const unarchiveUseCase = { execute: jest.fn() } as unknown as UnarchiveTransactionUseCase;
  const archiveMultipleUseCase = { execute: jest.fn() } as unknown as ArchiveMultipleTransactionsUseCase;
  const archiveAllByUserUseCase = { execute: jest.fn() } as unknown as ArchiveAllByUserUseCase;
  const getArchivedUseCase = { execute: jest.fn() } as unknown as GetArchivedTransactionsUseCase;

  router.use('/transactions', createTransactionRouter(
    createUseCase,
    getUseCase,
    analyticsService,
    getUserUseCase,
    getByIdUseCase,
    deleteUseCase,
    updateUseCase,
    updateWithLearningUseCase,
    archiveUseCase,
    unarchiveUseCase,
    archiveMultipleUseCase,
    archiveAllByUserUseCase,
    getArchivedUseCase
  ));

  router.use('*', notFoundHandler);
  router.use(errorHandler);

  const app: Express = express();
  app.use('/api', router);

  return {
    app,
    createUseCase,
    getByIdUseCase,
    updateUseCase,
    deleteUseCase,
    archiveUseCase,
    unarchiveUseCase,
    archiveMultipleUseCase,
  };
}

describe('Transaction API route boundaries', () => {
  let server: http.Server;
  let baseUrl: string;
  let mocks: ReturnType<typeof buildTransactionTestApp>;

  beforeEach((done) => {
    mocks = buildTransactionTestApp();
    server = mocks.app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      done();
    });
  });

  afterEach((done) => {
    server.close(done);
  });

  it('maps a missing transaction lookup to 404 JSON', async () => {
    (mocks.getByIdUseCase.execute as jest.Mock).mockResolvedValue({
      success: false,
      error: new NotFoundError('Transaction', 'missing-tx'),
    });

    const res = await fetch(`${baseUrl}/api/transactions/missing-tx`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Transaction not found: missing-tx',
    });
  });

  it('fails closed for a non-guest transaction when no auth is provided', async () => {
    (mocks.getByIdUseCase.execute as jest.Mock).mockResolvedValue({
      success: true,
      data: { id: 'tx-1', userId: 'real-user-id', amount: 100 },
    });

    const res = await fetch(`${baseUrl}/api/transactions/tx-1`);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatchObject({
      code: 'AUTHORIZATION_ERROR',
      message: 'Authentication required to access this transaction',
    });
  });

  it('allows reading a guest-owned transaction without auth', async () => {
    const transaction = { id: 'tx-guest', userId: 'guest_abc123', amount: 100 };
    (mocks.getByIdUseCase.execute as jest.Mock).mockResolvedValue({
      success: true,
      data: transaction,
    });

    const res = await fetch(`${baseUrl}/api/transactions/tx-guest`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(transaction);
  });

  it('validates empty guest transaction update bodies before calling update use cases', async () => {
    (mocks.getByIdUseCase.execute as jest.Mock).mockResolvedValue({
      success: true,
      data: { id: 'tx-guest', userId: 'guest_abc123', amount: 100 },
    });

    const res = await fetch(`${baseUrl}/api/transactions/tx-guest`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'At least one field must be provided for update',
    });
    expect(mocks.updateUseCase.execute).not.toHaveBeenCalled();
  });
});
