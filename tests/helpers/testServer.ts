import express, { Router } from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { errorHandler, notFoundHandler } from '../../src/delivery/web/express/middleware/errorMiddleware';
import { resetSharedRateLimiters } from '../../src/delivery/web/express/middleware/rateLimitMiddleware';

export interface LoopbackServer {
  server: http.Server;
  /** `http://127.0.0.1:<port>` */
  baseUrl: string;
  close(): Promise<void>;
}

/**
 * Serves `app` on a free port of 127.0.0.1 — the address the tests call — never on every interface (FT-151).
 *
 * A server on port 0 of every interface binds [::]. On macOS the kernel hands out ports one after another and, for
 * [::], does not look at IPv4 listeners: it can give the port another program (VS Code, GitKraken, rapportd…) holds on
 * 127.0.0.1, and the test's requests reach that program — 404 or a dropped connection instead of the test's answer.
 * Bound to 127.0.0.1, the kernel skips ports taken there.
 *
 * Like the app on start, the server begins with empty counters in the shared rate limiters: one test's requests never
 * count against the next.
 */
export async function listenOnLoopback(app: http.RequestListener): Promise<LoopbackServer> {
  await resetSharedRateLimiters();
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  return {
    server,
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

export interface TestServer {
  baseUrl: string;
  /** JSON request; `devUser` sends X-Dev-User-Id (the non-production auth used by the Mini App in dev). */
  request(method: string, url: string, options?: { body?: unknown; devUser?: number }): Promise<{ status: number; body: any }>;
  close(): Promise<void>;
}

/** Mount routers under /api on a free port of 127.0.0.1 (see listenOnLoopback). */
export async function startTestServer(routes: Record<string, Router>): Promise<TestServer> {
  const app = express();
  app.use(express.json());
  for (const [mount, router] of Object.entries(routes)) app.use(`/api${mount}`, router);
  app.use('*', notFoundHandler);
  app.use(errorHandler);

  const { baseUrl, close } = await listenOnLoopback(app);

  return {
    baseUrl,
    async request(method, url, options = {}) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (options.devUser !== undefined) headers['X-Dev-User-Id'] = String(options.devUser);
      const res = await fetch(`${baseUrl}${url}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    },
    close,
  };
}
