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
import { TransactionRepository } from '../src/modules/transaction/domain/transactionRepository';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';

const archivedTransaction: Transaction = {
  id: 'tx-archived',
  date: '2026-08-01',
  category: 'food',
  description: 'Hidden lunch',
  amount: 25000,
  type: 'expense',
  userId: 'guest_abc123',
  isArchived: true,
} as Transaction;

/**
 * Repository that behaves the way both real implementations do: findById hides
 * archived rows, findByIdIncludingArchived does not.
 */
function buildRepoWithArchivedRow(row: Transaction): TransactionRepository {
  return {
    create: jest.fn(),
    getAll: jest.fn(),
    delete: jest.fn(),
    findById: jest.fn().mockImplementation(async (id: string) =>
      id === row.id && !row.isArchived ? row : null
    ),
    findByUserId: jest.fn(),
    update: jest.fn(),
    getByUserIdAndDateRange: jest.fn(),
    archive: jest.fn(),
    unarchive: jest.fn(),
    archiveMultiple: jest.fn(),
    archiveAllByUserId: jest.fn(),
    findArchivedByUserId: jest.fn(),
    findByIdIncludingArchived: jest.fn().mockImplementation(async (id: string) =>
      id === row.id ? row : null
    ),
  } as any;
}

describe('GetTransactionByIdUseCase archived lookup', () => {
  it('hides an archived transaction by default', async () => {
    const useCase = new GetTransactionByIdUseCase(buildRepoWithArchivedRow(archivedTransaction));

    const result = await useCase.execute('tx-archived');

    expect(result.success).toBe(false);
  });

  it('returns an archived transaction when asked to include archived rows', async () => {
    const useCase = new GetTransactionByIdUseCase(buildRepoWithArchivedRow(archivedTransaction));

    const result = await useCase.execute('tx-archived', { includeArchived: true });

    expect(result.success).toBe(true);
    expect(result.success && result.data.id).toBe('tx-archived');
  });
});

function buildApp() {
  const router = express.Router();
  router.use(requestLogger);
  router.use(securityHeaders);
  router.use(corsHeaders);
  router.use(express.json({ limit: '10mb' }));

  const repository = buildRepoWithArchivedRow(archivedTransaction);
  const getByIdUseCase = new GetTransactionByIdUseCase(repository);
  const unarchiveUseCase = new UnarchiveTransactionUseCase(repository);

  const noop = { execute: jest.fn() };

  router.use('/transactions', createTransactionRouter(
    noop as unknown as CreateTransactionUseCase,
    noop as unknown as GetTransactionsUseCase,
    {
      getSummary: jest.fn(),
      getCategoryBreakdown: jest.fn(),
      getAnalyticsSummary: jest.fn(),
      getDetailedCategoryBreakdown: jest.fn(),
      getMonthlyTrends: jest.fn(),
      getSpendingPatterns: jest.fn(),
      getTopCategories: jest.fn(),
    } as unknown as AnalyticsService,
    noop as unknown as GetUserTransactionsUseCase,
    getByIdUseCase,
    noop as unknown as DeleteTransactionUseCase,
    noop as unknown as UpdateTransactionUseCase,
    noop as unknown as UpdateTransactionWithLearningUseCase,
    noop as unknown as ArchiveTransactionUseCase,
    unarchiveUseCase,
    noop as unknown as ArchiveMultipleTransactionsUseCase,
    noop as unknown as ArchiveAllByUserUseCase,
    noop as unknown as GetArchivedTransactionsUseCase,
    undefined,
    undefined
  ));

  router.use('*', notFoundHandler);
  router.use(errorHandler);

  const app: Express = express();
  app.use('/api', router);
  return { app, repository };
}

describe('POST /transactions/:id/unarchive', () => {
  let server: http.Server;
  let baseUrl: string;
  let built: ReturnType<typeof buildApp>;

  beforeEach((done) => {
    built = buildApp();
    server = built.app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      done();
    });
  });

  afterEach((done) => {
    server.close(done);
  });

  it('restores an archived transaction instead of reporting it missing', async () => {
    const res = await fetch(`${baseUrl}/api/transactions/tx-archived/unarchive`, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(built.repository.unarchive).toHaveBeenCalledWith('tx-archived');
  });

  it('still refuses to unarchive a transaction owned by someone else', async () => {
    const owned = { ...archivedTransaction, id: 'tx-owned', userId: 'real-user-id' } as Transaction;
    const repository = buildRepoWithArchivedRow(owned);
    const app = express();
    const router = express.Router();
    router.use(express.json());
    router.use('/transactions', createTransactionRouter(
      { execute: jest.fn() } as unknown as CreateTransactionUseCase,
      { execute: jest.fn() } as unknown as GetTransactionsUseCase,
      {} as unknown as AnalyticsService,
      { execute: jest.fn() } as unknown as GetUserTransactionsUseCase,
      new GetTransactionByIdUseCase(repository),
      { execute: jest.fn() } as unknown as DeleteTransactionUseCase,
      { execute: jest.fn() } as unknown as UpdateTransactionUseCase,
      { execute: jest.fn() } as unknown as UpdateTransactionWithLearningUseCase,
      { execute: jest.fn() } as unknown as ArchiveTransactionUseCase,
      new UnarchiveTransactionUseCase(repository),
      { execute: jest.fn() } as unknown as ArchiveMultipleTransactionsUseCase,
      { execute: jest.fn() } as unknown as ArchiveAllByUserUseCase,
      { execute: jest.fn() } as unknown as GetArchivedTransactionsUseCase,
      undefined,
      undefined
    ));
    router.use('*', notFoundHandler);
    router.use(errorHandler);
    app.use('/api', router);

    const s = app.listen(0);
    const { port } = s.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/transactions/tx-owned/unarchive`, { method: 'POST' });
    s.close();

    expect(res.status).toBe(403);
    expect(repository.unarchive).not.toHaveBeenCalled();
  });
});
