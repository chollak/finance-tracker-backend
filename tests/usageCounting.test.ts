import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';

import { CreateTransactionUseCase } from '../src/modules/transaction/application/createTransaction';
import { createTransactionRouter } from '../src/modules/transaction/presentation/controllers/transactionController';
import { createTextMessageHandler } from '../src/delivery/messaging/telegram/handlers/messageHandlers';
import { buildCaptureAck } from '../src/modules/quickCapture/application/buildCaptureAck';
import { CapturedTransaction, QuickCaptureResult } from '../src/modules/quickCapture/domain/quickCaptureTypes';

/**
 * A created transaction is counted against the free limit in exactly one place:
 * CreateTransactionUseCase. Delivery layers (bot handlers, HTTP middleware) must not count it again.
 */

function subscriptionMock() {
  const increment = jest.fn().mockResolvedValue(undefined);
  return {
    increment,
    module: { getIncrementUsageUseCase: () => ({ execute: increment }) } as any,
  };
}

const userModule = {
  getGetOrCreateUserUseCase: () => ({
    execute: jest.fn().mockResolvedValue({ id: '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b' }),
  }),
} as any;

function transactionCounts(increment: jest.Mock): number {
  return increment.mock.calls.filter(([arg]) => arg?.limitType === 'transactions').length;
}

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('CreateTransactionUseCase usage counting', () => {
  it('counts each created transaction exactly once', async () => {
    const { increment, module } = subscriptionMock();
    const repo = { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) } as any;
    const useCase = new CreateTransactionUseCase(repo);
    useCase.setSubscriptionDependencies(module, userModule);

    await useCase.execute({
      amount: 25000,
      type: 'expense',
      category: 'coffee',
      description: 'Кофе',
      date: '2026-10-14',
      userId: '131184740',
    });

    expect(transactionCounts(increment)).toBe(1);
  });
});

describe('Telegram handlers do not count transactions a second time', () => {
  function captured(id: string): CapturedTransaction {
    return {
      id,
      amount: 18000,
      type: 'expense',
      semanticType: 'expense',
      category: 'transport',
      description: 'такси',
      date: '2026-10-14',
      confidence: 1,
      needsReview: false,
      countsAsRealExpense: true,
    };
  }

  function baseContext(overrides: Record<string, unknown> = {}) {
    const transactions = [captured('tx-1')];
    const result: QuickCaptureResult = {
      status: 'saved',
      text: 'такси 18к',
      source: 'telegram',
      transactions,
      debts: [],
      ack: buildCaptureAck(transactions, { debtsDetected: 0 }),
      review: { reasons: [] },
    };
    return {
      message: { text: 'такси 18к' },
      from: { id: 131184740, first_name: 'Shukur' },
      session: {},
      reply: jest.fn().mockResolvedValue(undefined),
      sendChatAction: jest.fn().mockResolvedValue(undefined),
      modules: {
        quickCaptureModule: {
          getQuickCaptureService: () => ({ capture: jest.fn().mockResolvedValue(result) }),
        },
        transactionModule: {
          getGetUserTransactionsUseCase: () => ({ execute: jest.fn().mockResolvedValue([]) }),
          getCreateTransactionUseCase: () => ({
            execute: jest.fn().mockResolvedValue({ success: true, data: 'tx-9' }),
          }),
        },
      },
      ...overrides,
    };
  }

  it('text capture leaves counting to the create use case', async () => {
    const { increment, module } = subscriptionMock();

    await createTextMessageHandler(undefined, module)(baseContext() as any);
    await flush();

    expect(transactionCounts(increment)).toBe(0);
  });

  it('quick add by category leaves counting to the create use case', async () => {
    const { increment, module } = subscriptionMock();
    const ctx = baseContext({
      message: { text: '25000' },
      session: { pendingAction: { type: 'awaiting_amount', category: 'coffee' } },
    });

    await createTextMessageHandler(undefined, module)(ctx as any);
    await flush();

    expect(transactionCounts(increment)).toBe(0);
  });
});

describe('POST /api/transactions does not count transactions a second time', () => {
  let server: http.Server;
  let baseUrl: string;
  let increment: jest.Mock;
  let createExecute: jest.Mock;

  beforeEach((done) => {
    const subscription = subscriptionMock();
    increment = subscription.increment;
    createExecute = jest.fn().mockResolvedValue({ success: true, data: 'tx-1' });
    const stub = () => ({ execute: jest.fn() }) as any;

    const router = express.Router();
    router.use(express.json());
    router.use('/transactions', createTransactionRouter(
      { execute: createExecute } as any,
      stub(),
      {} as any,
      stub(),
      stub(),
      stub(),
      stub(),
      stub(),
      stub(),
      stub(),
      stub(),
      stub(),
      stub(),
      subscription.module,
      userModule
    ));

    const app = express();
    app.use('/api', router);
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      done();
    });
  });

  afterEach((done) => {
    server.close(done);
  });

  it('creates the transaction without a route-level usage increment', async () => {
    const res = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 25000,
        category: 'coffee',
        description: 'Кофе',
        type: 'expense',
        userId: '131184740',
      }),
    });
    await flush();

    expect(res.status).toBe(201);
    expect(createExecute).toHaveBeenCalledTimes(1);
    expect(transactionCounts(increment)).toBe(0);
  });
});
