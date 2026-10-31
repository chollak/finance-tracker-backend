import 'reflect-metadata';
import express from 'express';
import { buildServer } from '../src/delivery/web/express/expressServer';
import { createTransactionRouter } from '../src/modules/transaction/presentation/controllers/transactionController';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * FT-174: the admin routes that read every user's data — global transaction analytics and OpenAI usage — had
 * `requireAdmin` without `requireAuth` before it, so since 2026-01-22 they always answered 401, and nothing called them.
 * They are gone rather than fixed: no screen or script needs them.
 */

/** Any module method buildServer calls gives an empty object: these tests only ask for routes that are gone. */
const unusedModule = new Proxy({}, { get: () => () => ({}) }) as any;

describe('the dead admin routes are gone (FT-174)', () => {
  let server: LoopbackServer;

  beforeAll(async () => {
    const app = express();
    app.use('/api', buildServer(unusedModule, unusedModule, unusedModule, unusedModule, undefined));
    server = await listenOnLoopback(app);
  });

  afterAll(() => server.close());

  it.each([
    ['GET', '/api/openai/usage'],
    ['GET', '/api/openai/usage/summary'],
    ['POST', '/api/openai/usage/refresh'],
  ])('%s %s is not a route', async (method, path) => {
    const res = await fetch(`${server.baseUrl}${path}`, { method });
    expect(res.status).toBe(404);
  });

  it('GET /api/transactions/analytics is not a route of its own; the user-scoped analytics stay', () => {
    const router = createTransactionRouter(...(Array.from({ length: 20 }, () => unusedModule) as Parameters<typeof createTransactionRouter>));
    const routes = router.stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => `${Object.keys(layer.route.methods).join(',').toUpperCase()} ${layer.route.path}`);

    expect(routes).not.toContain('GET /analytics');
    expect(routes).toContain('GET /analytics/summary/:userId');
  });
});
