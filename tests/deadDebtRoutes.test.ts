import 'reflect-metadata';
import express from 'express';
import { buildServer } from '../src/delivery/web/express/expressServer';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * #265 (decision 2026-11-04): debts are gone from the code outside the capture path — `/api/debts*`, their use cases
 * and the Mini App's debt screens. They had left the interface with Д2 and had no caller. The `debts` and
 * `debt_payments` tables and their rows stay, and so do the records once written by debt payments.
 */

/** Any module method buildServer calls gives an empty object: these tests only ask for routes that are gone. */
const unusedModule = new Proxy({}, { get: () => () => ({}) }) as any;

const USER_ID = '131184740';
const DEBT_ID = 'd1';

describe('the debt routes are gone (#265)', () => {
  let server: LoopbackServer;

  beforeAll(async () => {
    const app = express();
    app.use('/api', buildServer(unusedModule, undefined));
    server = await listenOnLoopback(app);
  });

  afterAll(() => server.close());

  it.each([
    ['POST', `/api/debts/user/${USER_ID}`],
    ['GET', `/api/debts/user/${USER_ID}`],
    ['GET', `/api/debts/user/${USER_ID}/summary`],
    ['GET', `/api/debts/${DEBT_ID}`],
    ['GET', `/api/debts/${DEBT_ID}?withPayments=true`],
    ['PUT', `/api/debts/${DEBT_ID}`],
    ['DELETE', `/api/debts/${DEBT_ID}`],
    ['POST', `/api/debts/${DEBT_ID}/cancel`],
    ['POST', `/api/debts/${DEBT_ID}/pay`],
    ['POST', `/api/debts/${DEBT_ID}/pay-full`],
    ['DELETE', '/api/debts/payments/p1'],
  ])('%s %s is not a route', async (method, path) => {
    const res = await fetch(`${server.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({ type: 'i_owe', personName: 'Ali', amount: 50000 }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ success: false, code: 'NOT_FOUND' });
  });
});
