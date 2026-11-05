import 'reflect-metadata';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { telegramAccess } from '../src/shared/domain/access/telegramAccess';
import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { buildServer, JSON_BODY_LIMIT_BYTES } from '../src/delivery/web/express/expressServer';
import { createHttpApp } from '../src/delivery/web/express/httpApp';
import { errorHandler } from '../src/delivery/web/express/middleware/errorMiddleware';
import { UserModule } from '../src/modules/user/userModule';
import { QuickCaptureModule } from '../src/modules/quickCapture/quickCaptureModule';
import { QuickCaptureService } from '../src/modules/quickCapture/application/quickCaptureService';
import { MIN_PRODUCTION_SHORTCUT_TOKEN_LENGTH } from '../src/shared/domain/access/shortcutCaptureAccess';
import { captureLogLines, LogCapture } from './helpers/logLines';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * #272: the HTTP wrapping of the API, as the live instance serves it (`createHttpApp` over `buildServer`):
 * no open redirect from the old `/webapp/*` route, `no-store` on every `/api` answer, a small JSON body read only after
 * closed access, 413 for a body over the limit, CORS only for the origins that call the API, no `X-Powered-By`.
 */

const SIGNED_IN = 555111;
const STRANGER = 222;
const OWNER_UUID = 'owner-uuid';

/** Any module method buildServer calls gives an empty object: these tests do not reach its routes. */
const unusedModule = new Proxy({}, { get: () => () => ({}) }) as any;
/** Writes a record; a test asserts it is not called. */
const createRecord = jest.fn(async () => ({ success: true, data: 'record-1' }));
/** Every other use case of the records answers «nothing yet», so `GET /api/transactions` is a 200 with money in it. */
const emptyRecords = new Proxy({}, {
  get: (_target, name) => () =>
    name === 'getCreateTransactionUseCase' ? { execute: createRecord } : { execute: async () => ({ success: true, data: [] }) },
}) as any;
/** The signed-in Telegram user is the owner OWNER_UUID; the rest of the module is not reached. */
const userUseCases: Record<string, unknown> = {
  getGetOrCreateUserUseCase: { execute: async () => ({ id: OWNER_UUID }) },
  getGetUserUseCase: { execute: async () => ({ success: true, data: { id: OWNER_UUID } }) },
};
const userModule = new Proxy({}, { get: (_target, name) => () => userUseCases[String(name)] ?? {} }) as unknown as UserModule;

interface RawAnswer {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** A request with its path as written: fetch would normalize it (`\` becomes `/`), http.request sends it as is. */
function raw(baseUrl: string, method: string, requestPath: string, headers: http.OutgoingHttpHeaders = {}, body?: string): Promise<RawAnswer> {
  const { hostname, port } = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, path: requestPath, method, headers }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

const json = (value: unknown) => JSON.stringify(value);
const signedIn = (telegramId: number = SIGNED_IN) => ({ 'X-Dev-User-Id': String(telegramId) });
/** A JSON body twice the limit («ж» is two bytes): a phrase no client sends. */
const oversizedBody = () => json({ text: 'ж'.repeat(JSON_BODY_LIMIT_BYTES) });

describe('the HTTP app (#272)', () => {
  let webAppDir: string;
  let server: LoopbackServer;

  beforeAll(() => {
    webAppDir = fs.mkdtempSync(path.join(os.tmpdir(), '272-webapp-'));
    fs.writeFileSync(path.join(webAppDir, 'index.html'), '<!doctype html><title>Kapelka</title>');
    fs.mkdirSync(path.join(webAppDir, 'assets'));
    fs.writeFileSync(path.join(webAppDir, 'assets', 'app.js'), 'console.info("kapelka")');
  });

  afterAll(() => fs.rmSync(webAppDir, { recursive: true, force: true }));

  async function serve(allowed: string[] = []) {
    jest.replaceProperty(AppConfig, 'TELEGRAM_ACCESS', telegramAccess(allowed));
    const api = buildServer(emptyRecords, userModule, undefined, undefined);
    server = await listenOnLoopback(createHttpApp(api, webAppDir));
  }

  afterEach(async () => {
    await server?.close();
    jest.restoreAllMocks();
    createRecord.mockClear();
  });

  describe('the old /webapp/* path sends nobody to another site', () => {
    beforeEach(() => serve());

    it.each([
      '/webapp//evil.example/login',
      '/webapp///evil.example/login',
      '/webapp/\\evil.example/login',
      '/webapp/\\/evil.example/login',
      '/webapp/%2F%2Fevil.example/login',
      '/webapp/%5Cevil.example/login',
      '/webapp/%5C%5Cevil.example/login',
      '//evil.example/login',
      '/\\evil.example/login',
      '//assets',
    ])('%s', async requestPath => {
      const res = await raw(server.baseUrl, 'GET', requestPath);

      expect(res.status).toBeLessThan(400);
      const location = res.headers.location;
      if (location !== undefined) {
        expect(location).not.toMatch(/^[/\\]{2}/);
        expect(new URL(location, 'https://kapelka.example').host).toBe('kapelka.example');
      }
    });

    it('a page of the web app is its index.html, a file of it is the file', async () => {
      const page = await raw(server.baseUrl, 'GET', '/webapp/transactions');
      expect(page.status).toBe(200);
      expect(page.body).toContain('<title>Kapelka</title>');

      const file = await raw(server.baseUrl, 'GET', '/assets/app.js');
      expect(file.status).toBe(200);
      expect(file.body).toContain('kapelka');
    });
  });

  it('says nothing about Express, on the API and on the web app', async () => {
    await serve();

    for (const requestPath of ['/api/health', '/api/does-not-exist', '/', '/assets/app.js']) {
      const res = await raw(server.baseUrl, 'GET', requestPath);
      expect(res.headers['x-powered-by']).toBeUndefined();
    }
  });

  describe('no answer of /api is stored', () => {
    const NO_STORE = /(^|,\s*)no-store(\s*,|$)/;

    it('GET /api/health and a signed-in GET /api/transactions', async () => {
      await serve();

      const health = await raw(server.baseUrl, 'GET', '/api/health');
      expect(health.status).toBe(200);
      expect(health.headers['cache-control']).toMatch(NO_STORE);

      const records = await raw(server.baseUrl, 'GET', '/api/transactions', signedIn());
      expect(records.status).toBe(200);
      expect(JSON.parse(records.body)).toMatchObject({ success: true });
      expect(records.headers['cache-control']).toMatch(NO_STORE);
    });

    it('the refusals and errors too: 401, 403, 404, 400, 413 and a preflight', async () => {
      await serve([String(SIGNED_IN)]);
      const post = { 'Content-Type': 'application/json', ...signedIn() };

      const answers = await Promise.all([
        raw(server.baseUrl, 'GET', '/api/transactions'),
        raw(server.baseUrl, 'GET', '/api/transactions', signedIn(STRANGER)),
        raw(server.baseUrl, 'GET', '/api/does-not-exist'),
        raw(server.baseUrl, 'POST', '/api/transactions', post, '{ broken'),
        raw(server.baseUrl, 'POST', '/api/transactions', post, oversizedBody()),
        raw(server.baseUrl, 'OPTIONS', '/api/transactions'),
      ]);

      expect(answers.map(res => res.status)).toEqual([401, 403, 404, 400, 413, 200]);
      for (const res of answers) expect(res.headers['cache-control']).toMatch(NO_STORE);
    });
  });

  describe('the JSON body', () => {
    it('is at most JSON_BODY_LIMIT_BYTES: more is 413 PAYLOAD_TOO_LARGE, not 500', async () => {
      await serve();

      const res = await raw(
        server.baseUrl, 'POST', '/api/transactions', { 'Content-Type': 'application/json', ...signedIn() }, oversizedBody()
      );

      expect(res.status).toBe(413);
      expect(JSON.parse(res.body)).toEqual({ success: false, error: 'Request body is too large', code: 'PAYLOAD_TOO_LARGE' });

      // Just under the limit the body is read and the route answers it
      const justUnder = json({ description: 'a'.repeat(JSON_BODY_LIMIT_BYTES - 64) });
      expect(Buffer.byteLength(justUnder)).toBeLessThanOrEqual(JSON_BODY_LIMIT_BYTES);
      const read = await raw(
        server.baseUrl, 'POST', '/api/transactions', { 'Content-Type': 'application/json', ...signedIn() }, justUnder
      );
      expect(read.status).not.toBe(413);
      expect(JSON.parse(read.body).code).not.toBe('PAYLOAD_TOO_LARGE');
    });

    it('over the limit without Content-Length is 413 too', async () => {
      await serve();
      const { hostname, port } = new URL(server.baseUrl);

      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          { hostname, port, path: '/api/transactions', method: 'POST', headers: { 'Content-Type': 'application/json', ...signedIn() } },
          res => {
            res.resume();
            resolve(res.statusCode ?? 0);
          }
        );
        req.on('error', reject);
        // Chunked: the parser learns the size only by reading
        req.write('{"text":"');
        req.write('ж'.repeat(JSON_BODY_LIMIT_BYTES));
        req.end('"}');
      });

      expect(status).toBe(413);
    });

    it('is not read for a stranger: closed access answers before it', async () => {
      await serve([String(SIGNED_IN)]);
      const headers = { 'Content-Type': 'application/json' };

      const stranger = await raw(server.baseUrl, 'POST', '/api/transactions', { ...headers, ...signedIn(STRANGER) }, oversizedBody());
      expect(stranger.status).toBe(403);
      expect(JSON.parse(stranger.body)).toMatchObject({ code: 'ACCESS_NOT_ALLOWED' });

      const allowed = await raw(server.baseUrl, 'POST', '/api/transactions', { ...headers, ...signedIn() }, oversizedBody());
      expect(allowed.status).toBe(413);
    });

    it('in an encoding the parser does not know is the parser’s 415 INVALID_BODY, not 500', async () => {
      await serve();

      const res = await raw(
        server.baseUrl, 'POST', '/api/transactions',
        { 'Content-Type': 'application/json', 'Content-Encoding': 'compress', ...signedIn() }, json({ amount: 100 })
      );

      expect(res.status).toBe(415);
      expect(JSON.parse(res.body)).toEqual({ success: false, error: 'Request body could not be read', code: 'INVALID_BODY' });
      expect(createRecord).not.toHaveBeenCalled();
    });

    it('another error with a `type` and a 4xx `status` — OpenAI’s — stays a 500', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() } as any;
      const openAIError = Object.assign(new Error('400 Invalid request'), { type: 'invalid_request_error', status: 400 });

      errorHandler(openAIError, { path: '/quick-capture', method: 'POST', body: {}, params: {} } as any, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INTERNAL_ERROR' }));
    });

    it('is JSON only: a form body is not read', async () => {
      await serve();

      const res = await raw(
        server.baseUrl, 'POST', '/api/transactions',
        { 'Content-Type': 'application/x-www-form-urlencoded', ...signedIn() },
        'amount=100&type=expense&category=Кафе&description=кофе'
      );

      // The route got no fields: the record is refused for what it lacks, nothing is written
      expect(res.status).toBe(400);
      expect(createRecord).not.toHaveBeenCalled();
    });
  });

  describe('the log of a refused request: the path and the code, no body, no query', () => {
    let capture: LogCapture;
    const SECRET = 'Алишер';

    beforeEach(() => {
      capture = captureLogLines();
    });

    afterEach(() => capture.restore());

    function expectClean(lines: string[]) {
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).not.toContain(SECRET);
        expect(line).not.toContain(encodeURIComponent(SECRET));
        expect(line).not.toContain('?q=');
      }
    }

    it('a body that is not JSON', async () => {
      await serve();

      const res = await raw(
        server.baseUrl, 'POST', '/api/transactions', { 'Content-Type': 'application/json', ...signedIn() }, `{"description": "${SECRET}`
      );

      expect(res.status).toBe(400);
      expect(JSON.parse(res.body)).toMatchObject({ success: false, code: 'INVALID_JSON' });
      const lines = await capture.lines();
      expectClean(lines);
      expect(lines.some(line => line.includes('Request body refused') && line.includes('/transactions') && line.includes('INVALID_JSON'))).toBe(true);
    });

    it('a stranger’s request', async () => {
      await serve([String(SIGNED_IN)]);

      const res = await raw(
        server.baseUrl, 'GET', `/api/transactions/history?q=${encodeURIComponent(SECRET)}`, signedIn(STRANGER)
      );

      expect(res.status).toBe(403);
      const lines = await capture.lines();
      expectClean(lines);
      expect(lines.some(line => line.includes('not allowed refused') && line.includes('/api/transactions/history'))).toBe(true);
    });
  });

  describe('CORS: only the origins that call the API, never «*» with credentials', () => {
    const saved = { NODE_ENV: process.env.NODE_ENV, WEB_APP_URL: process.env.WEB_APP_URL };

    afterEach(() => {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });

    it('the web app’s origin, from WEB_APP_URL with a path, may call with credentials and PATCH', async () => {
      process.env.WEB_APP_URL = 'https://kapelka.example/';
      await serve();

      const preflight = await raw(server.baseUrl, 'OPTIONS', '/api/settings', {
        Origin: 'https://kapelka.example',
        'Access-Control-Request-Method': 'PATCH',
      });

      expect(preflight.status).toBe(200);
      expect(preflight.headers['access-control-allow-origin']).toBe('https://kapelka.example');
      expect(preflight.headers['access-control-allow-credentials']).toBe('true');
      expect(preflight.headers['access-control-allow-methods']).toMatch(/\bPATCH\b/);
      expect(preflight.headers.vary).toMatch(/\bOrigin\b/);
    });

    it('another site, Telegram’s own included, gets no CORS headers', async () => {
      process.env.WEB_APP_URL = 'https://kapelka.example';
      await serve();

      for (const origin of ['https://evil.example', 'https://web.telegram.org', 'https://telegram.org']) {
        const res = await raw(server.baseUrl, 'GET', '/api/health', { Origin: origin });
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
        expect(res.headers['access-control-allow-credentials']).toBeUndefined();
      }
    });

    it('in development a request without Origin gets no «*»; Vite’s dev server may call', async () => {
      process.env.NODE_ENV = 'development';
      await serve();

      const sameOrigin = await raw(server.baseUrl, 'GET', '/api/health');
      expect(sameOrigin.headers['access-control-allow-origin']).toBeUndefined();
      expect(sameOrigin.headers['access-control-allow-credentials']).toBeUndefined();

      const vite = await raw(server.baseUrl, 'GET', '/api/health', { Origin: 'http://localhost:5173' });
      expect(vite.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });
  });
});

/**
 * The limit leaves the iPhone's requests as they were: the longest phrase `POST /api/quick-capture` takes (2000
 * characters, `quickCaptureController.ts`) and a payment with the longest names (`PAYMENT_NAME_LIMITS`), by the
 * owner's token in production, as the Shortcut and the iOS app send them.
 */
describe('the largest capture of the iPhone fits the body limit (#272)', () => {
  const OWNER = '900000272';
  const TOKEN = 't'.repeat(MIN_PRODUCTION_SHORTCUT_TOKEN_LENGTH + 8);
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    SHORTCUT_CAPTURE_TOKEN: process.env.SHORTCUT_CAPTURE_TOKEN,
    SHORTCUT_CAPTURE_OWNER: process.env.SHORTCUT_CAPTURE_OWNER,
  };
  const service = { capture: jest.fn(async () => ({ ok: true })), capturePayment: jest.fn(async () => ({ ok: true })) };
  let server: LoopbackServer;

  beforeEach(async () => {
    process.env.NODE_ENV = 'production';
    process.env.SHORTCUT_CAPTURE_TOKEN = TOKEN;
    process.env.SHORTCUT_CAPTURE_OWNER = OWNER;
    jest.replaceProperty(AppConfig, 'TELEGRAM_ACCESS', telegramAccess([OWNER]));
    const quickCapture = new QuickCaptureModule(service as unknown as QuickCaptureService);
    server = await listenOnLoopback(createHttpApp(buildServer(unusedModule, undefined, undefined, quickCapture), os.tmpdir()));
  });

  afterEach(async () => {
    await server.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.restoreAllMocks();
    service.capture.mockClear();
    service.capturePayment.mockClear();
  });

  const byToken = { 'Content-Type': 'application/json', 'X-Shortcut-Capture-Token': TOKEN };

  it('the longest phrase, in the longest way JSON writes it', async () => {
    // A control character is six bytes in JSON («\u0001»): no phrase of 2000 characters is longer
    const text = '\u0001'.repeat(2000);
    const body = json({ text, clientId: '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b', capturedAt: '2026-11-05T09:15:00+05:00' });
    expect(Buffer.byteLength(body)).toBeGreaterThan(12_000);

    const res = await raw(server.baseUrl, 'POST', '/api/quick-capture', byToken, body);

    expect(res.status).toBe(200);
    expect(service.capture).toHaveBeenCalledWith(expect.objectContaining({ text, userId: OWNER }));
  });

  it('a payment with the longest merchant and account names', async () => {
    const payment = {
      amount: '25000', currency: 'UZS', merchant: 'Ж'.repeat(200), accountName: 'Ж'.repeat(100),
      clientId: '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4c', capturedAt: '2026-11-05T09:15:00+05:00',
    };

    const res = await raw(server.baseUrl, 'POST', '/api/quick-capture/payment', byToken, json(payment));

    expect(res.status).toBe(200);
    expect(service.capturePayment).toHaveBeenCalledWith(expect.objectContaining({ merchant: payment.merchant, userId: OWNER }));
  });
});
