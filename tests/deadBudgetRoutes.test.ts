import 'reflect-metadata';
import express from 'express';
import { buildServer } from '../src/delivery/web/express/expressServer';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * #264 (decision 2026-11-04): budgets are gone from the code — `BudgetModule`, `/api/budgets/*` and the Mini App's
 * budget screens. They had left the interface with Д2 and had no caller. The `budgets` table and its rows stay.
 */

/** Any module method buildServer calls gives an empty object: these tests only ask for routes that are gone. */
const unusedModule = new Proxy({}, { get: () => () => ({}) }) as any;

const USER_ID = '131184740';
const BUDGET_ID = 'b1';

describe('the budget routes are gone (#264)', () => {
  let server: LoopbackServer;

  beforeAll(async () => {
    const app = express();
    app.use('/api', buildServer(unusedModule, unusedModule, undefined));
    server = await listenOnLoopback(app);
  });

  afterAll(() => server.close());

  it.each([
    ['POST', `/api/budgets/users/${USER_ID}/budgets`],
    ['GET', `/api/budgets/users/${USER_ID}/budgets`],
    ['GET', `/api/budgets/users/${USER_ID}/budgets/summaries`],
    ['GET', `/api/budgets/users/${USER_ID}/budgets/alerts`],
    ['GET', `/api/budgets/${BUDGET_ID}`],
    ['PUT', `/api/budgets/${BUDGET_ID}`],
    ['DELETE', `/api/budgets/${BUDGET_ID}`],
    ['POST', `/api/budgets/${BUDGET_ID}/recalculate`],
  ])('%s %s is not a route', async (method, path) => {
    const res = await fetch(`${server.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({ name: 'Еда', amount: 1000000 }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ success: false, code: 'NOT_FOUND' });
  });
});
