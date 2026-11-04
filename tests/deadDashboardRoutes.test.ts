import 'reflect-metadata';
import express from 'express';
import { buildServer } from '../src/delivery/web/express/expressServer';
import { listenOnLoopback, LoopbackServer } from './helpers/testServer';

/**
 * #205: the backend dashboard `/api/dashboard/*` — insights, weekly, health score (premium only), alerts, the combined
 * dashboard and quick stats — had no caller left: Pastel's Home reads its own routes (FT-111), the bot never read it.
 * It is gone with `AlertService` and the premium gate that only it used.
 */

/** Any module method buildServer calls gives an empty object: these tests only ask for routes that are gone. */
const unusedModule = new Proxy({}, { get: () => () => ({}) }) as any;

const USER_ID = '131184740';

describe('the backend dashboard is gone (#205)', () => {
  let server: LoopbackServer;

  beforeAll(async () => {
    const app = express();
    app.use('/api', buildServer(unusedModule, unusedModule, undefined));
    server = await listenOnLoopback(app);
  });

  afterAll(() => server.close());

  it.each([
    `/api/dashboard/${USER_ID}`,
    `/api/dashboard/${USER_ID}/quick-stats`,
    `/api/dashboard/insights/${USER_ID}`,
    `/api/dashboard/insights/${USER_ID}/weekly`,
    `/api/dashboard/insights/${USER_ID}/health-score`,
    `/api/dashboard/alerts/${USER_ID}`,
    `/api/dashboard/alerts/${USER_ID}/summary`,
  ])('GET %s is not a route', async path => {
    const res = await fetch(`${server.baseUrl}${path}`);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ success: false, code: 'NOT_FOUND' });
  });
});
