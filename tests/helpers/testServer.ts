import express, { Router } from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { errorHandler, notFoundHandler } from '../../src/delivery/web/express/middleware/errorMiddleware';

export interface TestServer {
  baseUrl: string;
  /** JSON request; `devUser` sends X-Dev-User-Id (the non-production auth used by the Mini App in dev). */
  request(method: string, url: string, options?: { body?: unknown; devUser?: number }): Promise<{ status: number; body: any }>;
  close(): Promise<void>;
}

/** Mount routers under /api on a random local port. */
export async function startTestServer(routes: Record<string, Router>): Promise<TestServer> {
  const app = express();
  app.use(express.json());
  for (const [mount, router] of Object.entries(routes)) app.use(`/api${mount}`, router);
  app.use('*', notFoundHandler);
  app.use(errorHandler);

  const server = await new Promise<http.Server>(resolve => {
    const listening = app.listen(0, () => resolve(listening));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

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
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}
