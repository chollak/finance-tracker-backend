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
import { createQuickCaptureRouter } from '../src/modules/quickCapture/presentation/controllers/quickCaptureController';
import { QuickCaptureService } from '../src/modules/quickCapture/application/quickCaptureService';
import { QuickCaptureResult } from '../src/modules/quickCapture/domain/quickCaptureTypes';

/**
 * Route-contract tests for POST /api/quick-capture.
 *
 * SCOPE NOTE: same approach as tests/apiRoutes.test.ts — rather than stubbing every module
 * `buildServer()` needs, this assembles a minimal app from the *real* middleware chain and the
 * *real* router factory, in the same order buildServer uses (requestLogger -> securityHeaders ->
 * corsHeaders -> json/urlencoded -> routes -> notFoundHandler -> errorHandler), with only
 * QuickCaptureService mocked. The mount path mirrors buildServer's `/quick-capture` under the
 * `/api` prefix that src/index.ts applies, so the asserted URL is the real public one.
 */

const SAVED_RESULT: QuickCaptureResult = {
  status: 'saved',
  text: 'такси 18к',
  source: 'miniapp',
  transactions: [{
    id: 'tx-1',
    amount: 18000,
    type: 'expense',
    semanticType: 'expense',
    category: 'transport',
    description: 'такси',
    merchant: 'такси',
    date: '2026-09-02',
    confidence: 1,
    needsReview: false,
    countsAsRealExpense: true,
  }],
  ack: {
    title: 'Записал',
    summary: 'Такси · 18 000 сум · Транспорт',
    details: 'Сегодня',
    actions: ['edit', 'delete'],
  },
  review: { reasons: [] },
};

function buildTestApp() {
  const router = express.Router();

  router.use(requestLogger);
  router.use(securityHeaders);
  router.use(corsHeaders);
  router.use(express.json({ limit: '10mb' }));
  router.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const quickCaptureService = { capture: jest.fn() } as unknown as QuickCaptureService;
  router.use('/quick-capture', createQuickCaptureRouter(quickCaptureService));

  router.use('*', notFoundHandler);
  router.use(errorHandler);

  const app: Express = express();
  app.use('/api', router);

  return { app, quickCaptureService };
}

describe('POST /api/quick-capture', () => {
  let server: http.Server;
  let baseUrl: string;
  let mocks: ReturnType<typeof buildTestApp>;

  function post(body: unknown, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}/api/quick-capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

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

  describe('validation', () => {
    it('returns 400 when text is missing', async () => {
      const res = await post({ userId: 'guest_abc123' });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Text is required and cannot be empty',
      });
      expect(mocks.quickCaptureService.capture).not.toHaveBeenCalled();
    });

    it('returns 400 when text is blank', async () => {
      const res = await post({ userId: 'guest_abc123', text: '   ' });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(mocks.quickCaptureService.capture).not.toHaveBeenCalled();
    });

    it('returns 400 when text exceeds the 2000 character limit', async () => {
      const res = await post({ userId: 'guest_abc123', text: 'a'.repeat(2001) });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Text is too long (maximum 2000 characters)',
      });
      expect(mocks.quickCaptureService.capture).not.toHaveBeenCalled();
    });

    it('returns 400 for an unknown source', async () => {
      const res = await post({ userId: 'guest_abc123', text: 'такси 18к', source: 'smoke_signal' });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Source must be one of: telegram, miniapp, ios_shortcut',
      });
      expect(mocks.quickCaptureService.capture).not.toHaveBeenCalled();
    });

    it('returns 400 when userId is missing, without falling back to a default user', async () => {
      // X-Dev-User-Id gets past allowGuestMode (non-production only) so the handler's own
      // userId validation is what is being exercised here, not the auth middleware.
      const res = await post({ text: 'такси 18к' }, { 'X-Dev-User-Id': '555111' });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'User ID is required',
      });
      expect(mocks.quickCaptureService.capture).not.toHaveBeenCalled();
    });
  });

  describe('auth', () => {
    it('rejects a non-guest request with no auth header (401)', async () => {
      const res = await post({ userId: '555111', text: 'такси 18к' });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toMatchObject({ success: false, code: 'MISSING_AUTH_HEADER' });
      expect(mocks.quickCaptureService.capture).not.toHaveBeenCalled();
    });
  });

  describe('successful capture', () => {
    it('passes a guest capture to the service and returns the result payload', async () => {
      (mocks.quickCaptureService.capture as jest.Mock).mockResolvedValue(SAVED_RESULT);

      const res = await post({ userId: 'guest_abc123', text: 'такси 18к', source: 'miniapp' });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(SAVED_RESULT);
      expect(mocks.quickCaptureService.capture).toHaveBeenCalledWith({
        text: 'такси 18к',
        userId: 'guest_abc123',
        userName: undefined,
        source: 'miniapp',
      });
    });

    it('accepts a capture without a source', async () => {
      (mocks.quickCaptureService.capture as jest.Mock).mockResolvedValue({
        ...SAVED_RESULT,
        source: undefined,
      });

      const res = await post({ userId: 'guest_abc123', text: 'кофе 35000', userName: 'Shukur' });

      expect(res.status).toBe(200);
      expect(mocks.quickCaptureService.capture).toHaveBeenCalledWith({
        text: 'кофе 35000',
        userId: 'guest_abc123',
        userName: 'Shukur',
        source: undefined,
      });
    });

    it('maps a service failure to a 500 instead of leaking the error', async () => {
      (mocks.quickCaptureService.capture as jest.Mock).mockRejectedValue(new Error('parser exploded'));

      const res = await post({ userId: 'guest_abc123', text: 'такси 18к' });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatchObject({ code: 'INTERNAL_ERROR' });
      expect(JSON.stringify(body)).not.toContain('parser exploded');
    });
  });
});
