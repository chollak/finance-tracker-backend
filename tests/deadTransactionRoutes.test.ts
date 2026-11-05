import 'reflect-metadata';
import express from 'express';
import { buildServer } from '../src/delivery/web/express/expressServer';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * #273: the archive of records and the analytics of before FT-120 had no caller left. Neither the Mini App, nor the iOS
 * app, nor the bot archived a record — deleting is soft since FT-105 — and the analytics screen reads `/api/analytics`
 * since FT-120. They are gone with their use cases, `AnalyticsService` and the repository's archive methods. Records
 * archived before stay hidden everywhere, as decision Д7 says (`tests/archivedRecords.test.ts`).
 */

/** Any module method buildServer calls gives an empty object: these tests only ask for routes that are gone. */
const unusedModule = new Proxy({}, { get: () => () => ({}) }) as any;

const USER_ID = '131184740';
const RECORD_ID = '00000000-0000-4000-8000-000000000273';

describe('the archive and the old analytics of records are gone (#273)', () => {
  let server: LoopbackServer;

  beforeAll(async () => {
    const app = express();
    app.use('/api', buildServer(unusedModule, undefined));
    server = await listenOnLoopback(app);
  });

  afterAll(() => server.close());

  it.each([
    ['POST', `/api/transactions/${RECORD_ID}/archive`],
    ['POST', `/api/transactions/${RECORD_ID}/unarchive`],
    ['POST', '/api/transactions/archive/batch'],
    ['POST', `/api/transactions/archive/all/${USER_ID}`],
    ['GET', `/api/transactions/archived/user/${USER_ID}`],
    ['GET', `/api/transactions/analytics/summary/${USER_ID}`],
    ['GET', `/api/transactions/analytics/categories/${USER_ID}`],
    ['GET', `/api/transactions/analytics/trends/${USER_ID}`],
    ['GET', `/api/transactions/analytics/patterns/${USER_ID}`],
    ['GET', `/api/transactions/analytics/top-categories/${USER_ID}`],
  ])('%s %s is not a route', async (method, path) => {
    const res = await fetch(`${server.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify({ ids: [RECORD_ID] }) : undefined,
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ success: false, code: 'NOT_FOUND' });
  });
});
