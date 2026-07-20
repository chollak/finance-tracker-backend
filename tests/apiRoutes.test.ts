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
import { createVoiceProcessingRouter } from '../src/modules/voiceProcessing/presentation/controllers/voiceProcessingController';
import { createDebtRouter } from '../src/modules/debt/presentation/controllers/debtRoutes';
import { ProcessTextInputUseCase } from '../src/modules/voiceProcessing/application/processTextInput';
import { ProcessVoiceInputUseCase } from '../src/modules/voiceProcessing/application/processVoiceInput';
import { DebtModule } from '../src/modules/debt/debtModule';
import { ValidationError } from '../src/shared/domain/errors/AppError';

/**
 * Characterization/safety tests for the critical Express wiring in expressServer.ts:
 * health check, 404 handling, JSON body parsing, guest-mode auth bypass, and the
 * global error handler's status-code mapping.
 *
 * SCOPE NOTE: `buildServer()` wires 5+ full modules (Transaction, Voice, Budget,
 * Debt, OpenAIUsage), several of which need a dozen+ use-case getters just to
 * construct their routers, and DashboardRouter's factory eagerly `new`s services
 * from them. Faithfully stubbing all of that adds risk without adding coverage.
 * Instead, this suite assembles a minimal app using the *real* middleware and
 * router factories buildServer uses (same imports, same order: requestLogger ->
 * securityHeaders -> corsHeaders -> json/urlencoded -> routes -> notFoundHandler ->
 * errorHandler), with mocked module/use-case dependencies for the routers that are
 * exercised (voice, debt). The inline `/health` handler in expressServer.ts is not
 * exported as a standalone unit, so its JSON contract is reproduced verbatim here;
 * if that handler's shape changes, this test must be updated to match.
 */

function buildTestApp() {
  const router = express.Router();

  router.use(requestLogger);
  router.use(securityHeaders);
  router.use(corsHeaders);
  router.use(express.json({ limit: '10mb' }));
  router.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Mirrors the inline health handler in expressServer.ts:50-58
  router.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    });
  });

  const textUseCase = { execute: jest.fn() } as unknown as ProcessTextInputUseCase;
  const voiceUseCase = { execute: jest.fn() } as unknown as ProcessVoiceInputUseCase;
  router.use('/voice', createVoiceProcessingRouter(voiceUseCase, textUseCase));

  const debtModule = {
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
  } as unknown as DebtModule;
  router.use('/debts', createDebtRouter(debtModule));

  // Small test-only routes to directly exercise errorHandler's error-type mapping,
  // since the mounted controllers above catch errors internally and never call next(err).
  router.get('/test/throw-validation', (_req, _res, next) => {
    next(new ValidationError('bad input', 'someField'));
  });
  router.get('/test/throw-generic', (_req, _res, next) => {
    next(new Error('boom'));
  });

  router.use('*', notFoundHandler);
  router.use(errorHandler);

  const app: Express = express();
  app.use('/api', router);

  return { app, textUseCase, voiceUseCase, debtModule };
}

describe('API routes and middleware (characterization)', () => {
  let server: http.Server;
  let baseUrl: string;
  let mocks: ReturnType<typeof buildTestApp>;

  beforeEach((done) => {
    mocks = buildTestApp();
    server = mocks.app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      done();
    });
  });

  afterEach((done) => {
    server.close(done);
  });

  describe('health route', () => {
    it('returns healthy JSON', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('healthy');
      expect(typeof body.timestamp).toBe('string');
      expect(typeof body.uptime).toBe('number');
    });
  });

  describe('unknown route', () => {
    it('returns a 404 JSON error for an unmatched API route', async () => {
      const res = await fetch(`${baseUrl}/api/does-not-exist`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toMatchObject({
        success: false,
        code: 'NOT_FOUND',
      });
      expect(body.error).toBe('Route GET /api/does-not-exist not found');
    });
  });

  describe('CORS preflight', () => {
    it('short-circuits OPTIONS requests with 200', async () => {
      const res = await fetch(`${baseUrl}/api/health`, { method: 'OPTIONS' });
      expect(res.status).toBe(200);
    });
  });

  describe('voice text-input route (JSON parsing + guest mode)', () => {
    it('processes JSON body for a guest user without auth', async () => {
      (mocks.textUseCase.execute as jest.Mock).mockResolvedValue({
        text: 'coffee 5',
        transactions: [],
        debts: [],
      });

      const res = await fetch(`${baseUrl}/api/voice/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'guest_abc123', text: 'coffee 5' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ text: 'coffee 5', transactions: [], debts: [] });
      expect(mocks.textUseCase.execute).toHaveBeenCalledWith(
        'coffee 5',
        'guest_abc123',
        'Unknown User'
      );
    });

    it('rejects a non-guest request with no auth header (401)', async () => {
      const res = await fetch(`${baseUrl}/api/voice/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: '555111', text: 'coffee 5' }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toMatchObject({ success: false, code: 'MISSING_AUTH_HEADER' });
      expect(mocks.textUseCase.execute).not.toHaveBeenCalled();
    });

    it('returns 400 validation error when text is missing', async () => {
      const res = await fetch(`${baseUrl}/api/voice/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'guest_abc123' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Text is required and cannot be empty',
      });
    });
  });

  describe('debt route (guest mode + dev auth bypass)', () => {
    it('allows a guest user to create a debt without auth', async () => {
      (mocks.debtModule.createDebtUseCase.execute as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: 'debt-1', personName: 'Bob' },
      });

      const res = await fetch(`${baseUrl}/api/debts/user/guest_abc123`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'lent', personName: 'Bob', amount: '100', currency: 'UZS' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 'debt-1', personName: 'Bob' });
      expect(mocks.debtModule.createDebtUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'guest_abc123', personName: 'Bob' })
      );
    });

    it('rejects a non-guest request with no auth header (401)', async () => {
      const res = await fetch(`${baseUrl}/api/debts/user/555111`);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toMatchObject({ success: false, code: 'MISSING_AUTH_HEADER' });
      expect(mocks.debtModule.getDebtsUseCase.executeGetAll).not.toHaveBeenCalled();
    });

    it('allows a non-guest request via the X-Dev-User-Id bypass (non-production only)', async () => {
      (mocks.debtModule.getDebtsUseCase.executeGetAll as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      });

      const res = await fetch(`${baseUrl}/api/debts/user/555111`, {
        headers: { 'X-Dev-User-Id': '555111' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mocks.debtModule.getDebtsUseCase.executeGetAll).toHaveBeenCalledWith('555111', undefined);
    });

    it('maps a null debt lookup after ownership verification to a 404, not a 500', async () => {
      (mocks.debtModule.getDebtsUseCase.executeGetById as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: 'debt-1', userId: 'guest_abc123' },
      });
      (mocks.debtModule.getDebtsUseCase.executeGetWithPayments as jest.Mock).mockResolvedValue({
        success: true,
        data: null,
      });

      const res = await fetch(`${baseUrl}/api/debts/debt-1?withPayments=true`);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('global error handler', () => {
    it('maps a ValidationError thrown in a route to a 400 response', async () => {
      const res = await fetch(`${baseUrl}/api/test/throw-validation`);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toMatchObject({
        success: false,
        code: 'VALIDATION_ERROR',
        field: 'someField',
      });
    });

    it('maps an unrecognized thrown error to a generic 500 response', async () => {
      const res = await fetch(`${baseUrl}/api/test/throw-generic`);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
    });

    it('maps malformed JSON bodies to a 400 INVALID_JSON response', async () => {
      const res = await fetch(`${baseUrl}/api/voice/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ this is not valid json',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toMatchObject({ success: false, code: 'INVALID_JSON' });
    });
  });
});
