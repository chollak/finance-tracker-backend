import express, { Express } from 'express';
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
import { GetTransactionHistoryUseCase } from '../src/modules/transaction/application/getTransactionHistory';
import { AnalyticsService } from '../src/modules/transaction/application/analyticsService';
import { GetUserTransactionsUseCase } from '../src/modules/transaction/application/getUserTransactions';
import { GetTransactionByIdUseCase } from '../src/modules/transaction/application/getTransactionById';
import { DeleteTransactionUseCase, RestoreTransactionUseCase } from '../src/modules/transaction/application/deleteTransaction';
import { UpdateTransactionUseCase } from '../src/modules/transaction/application/updateTransaction';
import { UpdateTransactionWithLearningUseCase } from '../src/modules/transaction/application/updateTransactionWithLearning';
import { ArchiveTransactionUseCase } from '../src/modules/transaction/application/archiveTransaction';
import { UnarchiveTransactionUseCase } from '../src/modules/transaction/application/unarchiveTransaction';
import { ArchiveMultipleTransactionsUseCase } from '../src/modules/transaction/application/archiveMultipleTransactions';
import { ArchiveAllByUserUseCase } from '../src/modules/transaction/application/archiveAllByUser';
import { GetArchivedTransactionsUseCase } from '../src/modules/transaction/application/getArchivedTransactions';
import { NotFoundError } from '../src/shared/domain/errors/AppError';
import { UserModule } from '../src/modules/user/userModule';
import { listenOnLoopback } from './helpers/testServer';

// Signed in through the local dev header as TELEGRAM_ID, who owns the records stored under USER_UUID
const TELEGRAM_ID = '131184740';
const USER_UUID = '02c5718f-b6db-4990-894e-3fc080bb2a83';
const SIGNED_IN = { 'Content-Type': 'application/json', 'X-Dev-User-Id': TELEGRAM_ID };

function signedInUserModule(): UserModule {
  return {
    getGetOrCreateUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ id: USER_UUID, telegramId: TELEGRAM_ID }) }),
    getGetUserUseCase: () => ({
      execute: jest.fn().mockResolvedValue({ success: true, data: { id: USER_UUID, telegramId: TELEGRAM_ID } }),
    }),
  } as unknown as UserModule;
}

/**
 * Stands in for webSessionMiddleware (FT-128), which puts the user of a valid session cookie in `req.webSession`: a
 * browser signed in through the bot. A cookie that ended or was signed out leaves it unset, as no header does here.
 */
const SESSION_HEADER = 'x-test-web-session';
const SIGNED_IN_BY_SESSION = { 'Content-Type': 'application/json', [SESSION_HEADER]: TELEGRAM_ID };

function testWebSession(req: express.Request, _res: express.Response, next: express.NextFunction): void {
  const telegramId = req.headers[SESSION_HEADER];
  if (typeof telegramId === 'string') req.webSession = { telegramId: Number(telegramId) };
  next();
}

function buildTransactionTestApp(options: { userModule?: UserModule } = {}) {
  const router = express.Router();

  router.use(requestLogger);
  router.use(testWebSession);
  router.use(securityHeaders);
  router.use(corsHeaders);
  router.use(express.json({ limit: '10mb' }));
  router.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const createUseCase = { execute: jest.fn() } as unknown as CreateTransactionUseCase;
  const getUseCase = { execute: jest.fn() } as unknown as GetTransactionHistoryUseCase;
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
  const restoreUseCase = { execute: jest.fn() } as unknown as RestoreTransactionUseCase;

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
    getArchivedUseCase,
    undefined,
    options.userModule,
    restoreUseCase
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
    restoreUseCase,
  };
}

/**
 * Every route on one record (#271): the record sheet, an edit, a delete, «Отменить» — and the archive's three until
 * #273 removes them. Each signs in first, as every other route does, before it reads the record. Three items in every
 * row: with fewer, it.each would hand the test a `done` callback in place of the body.
 */
const RECORD_ROUTES: Array<[method: string, path: string, body: unknown]> = [
  ['GET', '/api/transactions/tx-1', undefined],
  ['PUT', '/api/transactions/tx-1', { amount: 150 }],
  ['DELETE', '/api/transactions/tx-1', undefined],
  ['POST', '/api/transactions/tx-1/restore', undefined],
  ['POST', '/api/transactions/tx-1/archive', undefined],
  ['POST', '/api/transactions/tx-1/unarchive', undefined],
  ['POST', '/api/transactions/archive/batch', { ids: ['tx-1'] }],
];

/** The routes the Mini App and the iOS app use on one record; the archive's go with #273. */
const LIVE_RECORD_ROUTES = RECORD_ROUTES.slice(0, 4);

const SOMEONE_ELSES_RECORD = { id: 'tx-1', userId: 'someone-elses-uuid', amount: 100, category: 'food', type: 'expense' };
const OWN_RECORD = { ...SOMEONE_ELSES_RECORD, userId: USER_UUID };

describe('Transaction API route boundaries', () => {
  let server: http.Server;
  let baseUrl: string;
  let mocks: ReturnType<typeof buildTransactionTestApp>;

  beforeEach(async () => {
    mocks = buildTransactionTestApp({ userModule: signedInUserModule() });
    ({ server, baseUrl } = await listenOnLoopback(mocks.app));
  });

  afterEach((done) => {
    server.close(done);
  });

  async function call(method: string, path: string, headers: Record<string, string> = {}, body?: unknown) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  /** The use cases a record route may run after it signed in and found the record its user's. */
  const recordWrites = () => [
    mocks.updateUseCase.execute,
    mocks.deleteUseCase.execute,
    mocks.restoreUseCase.execute,
    mocks.archiveUseCase.execute,
    mocks.unarchiveUseCase.execute,
    mocks.archiveMultipleUseCase.execute,
  ] as jest.Mock[];

  describe('a record’s routes sign in first (#271)', () => {
    beforeEach(() => {
      (mocks.getByIdUseCase.execute as jest.Mock).mockResolvedValue({ success: true, data: SOMEONE_ELSES_RECORD });
    });

    it.each(RECORD_ROUTES)('%s %s without sign-in: 401 MISSING_AUTH_HEADER, the record is not even read', async (method, path, body) => {
      const res = await call(method, path, {}, body);

      expect([res.status, res.body]).toEqual([401, expect.objectContaining({ success: false, code: 'MISSING_AUTH_HEADER' })]);
      expect(mocks.getByIdUseCase.execute).not.toHaveBeenCalled();
      for (const write of recordWrites()) expect(write).not.toHaveBeenCalled();
    });

    it.each(RECORD_ROUTES)('%s %s with an Authorization that is not initData: 401, not a request let on unsigned', async (method, path, body) => {
      const res = await call(method, path, { Authorization: 'Bearer something' }, body);

      expect([res.status, res.body.code]).toEqual([401, 'INVALID_AUTH_FORMAT']);
      expect(mocks.getByIdUseCase.execute).not.toHaveBeenCalled();
    });

    it('an unknown id without sign-in gets the same 401: the answer does not tell which ids exist', async () => {
      (mocks.getByIdUseCase.execute as jest.Mock).mockImplementation(async (id: string) => (id === 'tx-1'
        ? { success: true, data: SOMEONE_ELSES_RECORD }
        : { success: false, error: new NotFoundError('Transaction', id) }));

      const unknown = await call('GET', '/api/transactions/missing-tx');

      expect(unknown.status).toBe(401);
      expect(unknown).toEqual(await call('GET', '/api/transactions/tx-1'));
    });
  });

  describe.each([
    ['initData or the dev header', SIGNED_IN],
    ['the browser’s session', SIGNED_IN_BY_SESSION],
  ])('signed in by %s, as before', (_way, headers) => {
    it('the user’s own record: read, changed, deleted, brought back', async () => {
      (mocks.getByIdUseCase.execute as jest.Mock).mockResolvedValue({ success: true, data: OWN_RECORD });
      (mocks.updateUseCase.execute as jest.Mock).mockResolvedValue({ success: true, data: { ...OWN_RECORD, amount: 150 } });
      (mocks.deleteUseCase.execute as jest.Mock).mockResolvedValue({ success: true });
      (mocks.restoreUseCase.execute as jest.Mock).mockResolvedValue({ success: true, data: OWN_RECORD });

      const statuses = [];
      for (const [method, path, body] of LIVE_RECORD_ROUTES) statuses.push((await call(method, path, headers, body)).status);

      expect(statuses).toEqual([200, 200, 200, 200]);
      expect(mocks.updateUseCase.execute).toHaveBeenCalledWith({ id: 'tx-1', amount: 150 });
      expect(mocks.deleteUseCase.execute).toHaveBeenCalledWith({ id: 'tx-1' });
      expect(mocks.restoreUseCase.execute).toHaveBeenCalledWith({ id: 'tx-1' });
    });

    it.each(LIVE_RECORD_ROUTES)('%s %s of someone else’s record: 403 AUTHORIZATION_ERROR, nothing changes', async (method, path, body) => {
      (mocks.getByIdUseCase.execute as jest.Mock).mockResolvedValue({ success: true, data: SOMEONE_ELSES_RECORD });

      const res = await call(method, path, headers, body);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        success: false,
        error: { code: 'AUTHORIZATION_ERROR', message: 'You do not have permission to access this transaction' },
      });
      for (const write of recordWrites()) expect(write).not.toHaveBeenCalled();
    });

    it.each(LIVE_RECORD_ROUTES)('%s %s of an unknown record: 404 NOT_FOUND', async (method, path, body) => {
      (mocks.getByIdUseCase.execute as jest.Mock).mockResolvedValue({
        success: false,
        error: new NotFoundError('Transaction', 'tx-1'),
      });

      const res = await call(method, path, headers, body);

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND', message: 'Transaction not found: tx-1' } });
      for (const write of recordWrites()) expect(write).not.toHaveBeenCalled();
    });
  });

  it('a record left with a guest_ owner by the old guest mode is nobody’s: 403 for a signed-in user', async () => {
    (mocks.getByIdUseCase.execute as jest.Mock).mockResolvedValue({
      success: true,
      data: { id: 'tx-guest', userId: 'guest_abc123', amount: 100 },
    });

    const res = await call('GET', '/api/transactions/tx-guest', SIGNED_IN);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, error: { code: 'AUTHORIZATION_ERROR' } });
  });

  it('refuses to create a transaction without signing in (401)', async () => {
    const res = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100, category: 'food', description: 'Lunch', type: 'expense', userId: TELEGRAM_ID }),
    });

    expect(res.status).toBe(401);
    expect(mocks.createUseCase.execute).not.toHaveBeenCalled();
  });

  it('refuses to create a transaction for another user named in the body (403)', async () => {
    const res = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: SIGNED_IN,
      body: JSON.stringify({ amount: 100, category: 'food', description: 'Lunch', type: 'expense', userId: '597843119' }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ success: false, code: 'ACCESS_DENIED' });
    expect(mocks.createUseCase.execute).not.toHaveBeenCalled();
  });

  it('allows local development update and delete with X-Dev-User-Id when ownership matches', async () => {
    const userUuid = '02c5718f-b6db-4990-894e-3fc080bb2a83';
    const telegramId = '131184740';
    const userModule = {
      getGetOrCreateUserUseCase: () => ({
        execute: jest.fn().mockResolvedValue({ id: userUuid, telegramId }),
      }),
      getGetUserUseCase: () => ({
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: { id: userUuid, telegramId },
        }),
      }),
    } as unknown as UserModule;

    await new Promise<void>((resolve) => server.close(() => resolve()));
    mocks = buildTransactionTestApp({ userModule });
    ({ server, baseUrl } = await listenOnLoopback(mocks.app));

    (mocks.getByIdUseCase.execute as jest.Mock).mockResolvedValue({
      success: true,
      data: { id: 'tx-1', userId: userUuid, amount: 100, category: 'food', type: 'expense' },
    });
    (mocks.updateUseCase.execute as jest.Mock).mockResolvedValue({
      success: true,
      data: { id: 'tx-1', userId: userUuid, amount: 150 },
    });
    (mocks.deleteUseCase.execute as jest.Mock).mockResolvedValue({ success: true });

    const updateRes = await fetch(`${baseUrl}/api/transactions/tx-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Dev-User-Id': telegramId },
      body: JSON.stringify({ amount: 150 }),
    });
    expect(updateRes.status).toBe(200);
    expect(mocks.updateUseCase.execute).toHaveBeenCalledWith({ id: 'tx-1', amount: 150 });

    const deleteRes = await fetch(`${baseUrl}/api/transactions/tx-1?userId=${telegramId}`, {
      method: 'DELETE',
      headers: { 'X-Dev-User-Id': telegramId },
    });
    expect(deleteRes.status).toBe(200);
    expect(mocks.deleteUseCase.execute).toHaveBeenCalledWith({ id: 'tx-1' });
  });

  it('validates empty transaction update bodies before calling update use cases', async () => {
    (mocks.getByIdUseCase.execute as jest.Mock).mockResolvedValue({
      success: true,
      data: { id: 'tx-own', userId: USER_UUID, amount: 100 },
    });

    const res = await fetch(`${baseUrl}/api/transactions/tx-own`, {
      method: 'PUT',
      headers: SIGNED_IN,
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

  it('accepts a valid semanticType on create and passes it to the create use case', async () => {
    (mocks.createUseCase.execute as jest.Mock).mockResolvedValue({
      success: true,
      data: 'tx-new',
    });

    const res = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: SIGNED_IN,
      body: JSON.stringify({
        amount: 500000,
        category: 'transfer',
        description: 'TBC -> Alif',
        type: 'expense',
        semanticType: 'own_transfer',
        userId: TELEGRAM_ID,
      }),
    });

    expect(res.status).toBe(201);
    expect(mocks.createUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ semanticType: 'own_transfer' }),
      expect.objectContaining({ onRepeat: expect.any(Function) })
    );
  });

  // FT-113: the note on the manual entry screen is optional («Например, супермаркет» is only a hint)
  it.each([
    ['without a description', {}],
    ['with an empty description', { description: '' }],
    ['with a blank description', { description: '   ' }],
  ])('creates a record %s: the note is stored empty', async (_case, note) => {
    (mocks.createUseCase.execute as jest.Mock).mockResolvedValue({ success: true, data: 'tx-new' });

    const res = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: SIGNED_IN,
      body: JSON.stringify({ amountMinor: 18_640_000, categoryId: 'cat-1', type: 'expense', userId: TELEGRAM_ID, ...note }),
    });

    expect(res.status).toBe(201);
    expect(mocks.createUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ description: '', amountMinor: 18_640_000, categoryId: 'cat-1' }),
      expect.objectContaining({ onRepeat: expect.any(Function) })
    );
  });

  it('still refuses a note that is not text or longer than 500 characters', async () => {
    for (const description of [42, 'x'.repeat(501)]) {
      const res = await fetch(`${baseUrl}/api/transactions`, {
        method: 'POST',
        headers: SIGNED_IN,
        body: JSON.stringify({ amountMinor: 100, categoryId: 'cat-1', type: 'expense', userId: TELEGRAM_ID, description }),
      });

      expect(res.status).toBe(400);
    }
    expect(mocks.createUseCase.execute).not.toHaveBeenCalled();
  });

  it('rejects an invalid semanticType on create with 400 and does not call the create use case', async () => {
    const res = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: SIGNED_IN,
      body: JSON.stringify({
        amount: 100,
        category: 'food',
        description: 'Lunch',
        type: 'expense',
        semanticType: 'crypto_trade',
        userId: TELEGRAM_ID,
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.createUseCase.execute).not.toHaveBeenCalled();
  });

  it('passes semanticType through to the update use case on PUT', async () => {
    (mocks.getByIdUseCase.execute as jest.Mock).mockResolvedValue({
      success: true,
      data: { id: 'tx-own', userId: USER_UUID, amount: 100 },
    });
    (mocks.updateUseCase.execute as jest.Mock).mockResolvedValue({
      success: true,
      data: { id: 'tx-own', userId: USER_UUID, amount: 100, semanticType: 'saving_deposit' },
    });

    const res = await fetch(`${baseUrl}/api/transactions/tx-own`, {
      method: 'PUT',
      headers: SIGNED_IN,
      body: JSON.stringify({ semanticType: 'saving_deposit' }),
    });

    expect(res.status).toBe(200);
    expect(mocks.updateUseCase.execute).toHaveBeenCalledWith({
      id: 'tx-own',
      semanticType: 'saving_deposit',
    });
  });

  it('passes accountId and currency through on PUT and answers 400 when the use case refuses the pair (FT-103)', async () => {
    (mocks.getByIdUseCase.execute as jest.Mock).mockResolvedValue({
      success: true,
      data: { id: 'tx-own', userId: USER_UUID, amount: 100 },
    });
    const { ValidationError } = jest.requireActual('../src/shared/domain/errors/AppError');
    (mocks.updateUseCase.execute as jest.Mock).mockResolvedValue({
      success: false,
      error: new ValidationError('The record is in USD, the account «Карта» in UZS', 'accountId'),
    });

    const res = await fetch(`${baseUrl}/api/transactions/tx-own`, {
      method: 'PUT',
      headers: SIGNED_IN,
      body: JSON.stringify({ accountId: 'acc-card', currency: 'USD' }),
    });

    expect(res.status).toBe(400);
    expect(mocks.updateUseCase.execute).toHaveBeenCalledWith({ id: 'tx-own', accountId: 'acc-card', currency: 'USD' });
  });

  it('refuses a currency other than UZS or USD on create', async () => {
    const res = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: SIGNED_IN,
      body: JSON.stringify({ amount: 100, category: 'food', description: 'x', type: 'expense', userId: TELEGRAM_ID, currency: 'EUR' }),
    });

    expect(res.status).toBe(400);
    expect(mocks.createUseCase.execute).not.toHaveBeenCalled();
  });

  it('defaults needsReview to false on create when omitted', async () => {
    (mocks.createUseCase.execute as jest.Mock).mockResolvedValue({
      success: true,
      data: 'tx-new',
    });

    const res = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: SIGNED_IN,
      body: JSON.stringify({
        amount: 100,
        category: 'food',
        description: 'Lunch',
        type: 'expense',
        userId: TELEGRAM_ID,
      }),
    });

    expect(res.status).toBe(201);
    expect(mocks.createUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ needsReview: false }),
      expect.objectContaining({ onRepeat: expect.any(Function) })
    );
  });

  it('accepts an explicit needsReview: true on create and passes it to the create use case', async () => {
    (mocks.createUseCase.execute as jest.Mock).mockResolvedValue({
      success: true,
      data: 'tx-new',
    });

    const res = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: SIGNED_IN,
      body: JSON.stringify({
        amount: 100,
        category: 'food',
        description: 'Lunch',
        type: 'expense',
        needsReview: true,
        userId: TELEGRAM_ID,
      }),
    });

    expect(res.status).toBe(201);
    expect(mocks.createUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ needsReview: true }),
      expect.objectContaining({ onRepeat: expect.any(Function) })
    );
  });

  it('rejects a non-boolean needsReview on create with 400 and does not call the create use case', async () => {
    const res = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: SIGNED_IN,
      body: JSON.stringify({
        amount: 100,
        category: 'food',
        description: 'Lunch',
        type: 'expense',
        needsReview: 'yes',
        userId: TELEGRAM_ID,
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.createUseCase.execute).not.toHaveBeenCalled();
  });

  it('passes needsReview through to the update use case on PUT', async () => {
    (mocks.getByIdUseCase.execute as jest.Mock).mockResolvedValue({
      success: true,
      data: { id: 'tx-own', userId: USER_UUID, amount: 100 },
    });
    (mocks.updateUseCase.execute as jest.Mock).mockResolvedValue({
      success: true,
      data: { id: 'tx-own', userId: USER_UUID, amount: 100, needsReview: true },
    });

    const res = await fetch(`${baseUrl}/api/transactions/tx-own`, {
      method: 'PUT',
      headers: SIGNED_IN,
      body: JSON.stringify({ needsReview: true }),
    });

    expect(res.status).toBe(200);
    expect(mocks.updateUseCase.execute).toHaveBeenCalledWith({
      id: 'tx-own',
      needsReview: true,
    });
  });
});
