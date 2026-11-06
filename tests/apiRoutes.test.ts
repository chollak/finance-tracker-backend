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
import { createHealthHandler } from '../src/delivery/web/express/routes/healthRoutes';
import { UserModule } from '../src/modules/user/userModule';
import { NotFoundError, ValidationError } from '../src/shared/domain/errors/AppError';
import { listenOnLoopback } from './helpers/testServer';

/**
 * Characterization/safety tests for the critical Express wiring in expressServer.ts:
 * health check, 404 handling, JSON body parsing, sign-in (no guests since 2026-10-21),
 * and the global error handler's status-code mapping.
 *
 * SCOPE NOTE: `buildServer()` wires 5+ full modules (Transaction, User, Subscription, …),
 * several of which need a dozen+ use-case getters just to
 * construct their routers. Faithfully stubbing all of that adds risk without adding coverage.
 * Instead, this suite assembles a minimal app using the *real* middleware and
 * router factories buildServer uses (same imports, same order: requestLogger ->
 * securityHeaders -> corsHeaders -> json/urlencoded -> routes -> notFoundHandler ->
 * errorHandler), with mocked module/use-case dependencies for the router that is
 * exercised (records; the voice routes it used to exercise are gone, #221, the debt routes too, #265). `/health` uses the same handler as expressServer.ts
 * (`createHealthHandler`, FT-154) with the bot switched off; its 503 is in healthRoute.test.ts.
 */

const OWNER_UUID = 'record-owner-uuid';

function buildTestApp() {
  const router = express.Router();

  router.use(requestLogger);
  router.use(securityHeaders);
  router.use(corsHeaders);
  router.use(express.json({ limit: '10mb' }));
  router.use(express.urlencoded({ extended: true, limit: '10mb' }));

  router.get('/health', createHealthHandler(() => ({ state: 'disabled', attempts: 0 })));

  const records = {
    create: { execute: jest.fn() },
    ofUser: { execute: jest.fn() },
    byId: { execute: jest.fn() },
  };
  const unused = { execute: jest.fn() } as never;
  // The signed-in Telegram user 555111 owns the records stored under OWNER_UUID
  const userModule = {
    getGetOrCreateUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ id: OWNER_UUID }) }),
    getGetUserUseCase: () => ({ execute: jest.fn().mockResolvedValue({ success: true, data: { id: OWNER_UUID } }) }),
  } as unknown as UserModule;
  router.use('/transactions', createTransactionRouter(
    records.create as never, unused, records.ofUser as never, records.byId as never,
    unused, unused, unused,
    undefined,
    userModule
  ));

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

  return { app, records };
}

describe('API routes and middleware (characterization)', () => {
  let server: http.Server;
  let baseUrl: string;
  let mocks: ReturnType<typeof buildTestApp>;
  const records = () => mocks.records;

  beforeEach(async () => {
    mocks = buildTestApp();
    ({ server, baseUrl } = await listenOnLoopback(mocks.app));
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

  describe('records route (sign-in + dev auth bypass)', () => {
    // The JSON body of a signed-in write; it was checked on /api/voice/text-input until that route went (#221), then
    // on the debt routes until they went (#265)
    it('reads the JSON body of a signed-in user’s record', async () => {
      records().create.execute.mockResolvedValue({ success: true, data: 'record-1' });

      const res = await fetch(`${baseUrl}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Dev-User-Id': '555111' },
        body: JSON.stringify({ amount: 100, type: 'expense', category: 'Кафе', description: 'Bob', date: '2026-11-04' }),
      });

      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({ success: true, data: { id: 'record-1' } });
      expect(records().create.execute).toHaveBeenCalledWith(
        expect.objectContaining({ userId: OWNER_UUID, amount: 100, type: 'expense', category: 'Кафе', description: 'Bob' }),
        expect.anything()
      );
    });

    it('refuses to write a record for a guest id without auth (401)', async () => {
      const res = await fetch(`${baseUrl}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'guest_abc123', amount: 100, type: 'expense', category: 'Кафе', description: 'Bob' }),
      });

      expect(res.status).toBe(401);
      expect(records().create.execute).not.toHaveBeenCalled();
    });

    it('rejects a request with no auth header (401)', async () => {
      const res = await fetch(`${baseUrl}/api/transactions/user/555111`);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toMatchObject({ success: false, code: 'MISSING_AUTH_HEADER' });
      expect(records().ofUser.execute).not.toHaveBeenCalled();
    });

    it('allows a signed-in request via the X-Dev-User-Id bypass (non-production only)', async () => {
      records().ofUser.execute.mockResolvedValue({ success: true, data: [] });

      const res = await fetch(`${baseUrl}/api/transactions/user/555111`, {
        headers: { 'X-Dev-User-Id': '555111' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // The Telegram id in the path is resolved to the owner's UUID
      expect(records().ofUser.execute).toHaveBeenCalledWith(OWNER_UUID);
    });

    it('maps a record that is not there to a 404, not a 500', async () => {
      records().byId.execute.mockResolvedValue({ success: false, error: new NotFoundError('Transaction', 'record-1') });

      const res = await fetch(`${baseUrl}/api/transactions/record-1`, {
        headers: { 'X-Dev-User-Id': '555111' },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({ code: 'NOT_FOUND' });
      expect(records().byId.execute).toHaveBeenCalledWith('record-1', undefined);
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
      const res = await fetch(`${baseUrl}/api/transactions`, {
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
