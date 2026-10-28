import fs from 'fs';
import http from 'http';
import path from 'path';
import { Router } from 'express';
import { strictRateLimiter } from '../src/delivery/web/express/middleware/rateLimitMiddleware';
import { startTestServer, TestServer } from './helpers/testServer';

/**
 * FT-151: HTTP tests failed now and then in a full run — 404 instead of 201, or `fetch failed` / ECONNRESET.
 *
 * The cause: a test server listened on port 0 of every interface ([::]), and the test called it at 127.0.0.1. On macOS
 * the kernel hands out ports one after another and, for [::], does not look at IPv4 listeners. When the next port was
 * held on 127.0.0.1 by another program of this Mac (VS Code, GitKraken, Notion, OrbStack, rapportd keep such
 * listeners), the test server got it too, and the test's requests went to that program: 404 from one that speaks
 * HTTP, a dropped connection from one that does not.
 */

/** Plays another program of this Mac: holds the ports just ahead of the kernel's counter on 127.0.0.1. */
async function holdNextPorts(count: number): Promise<http.Server[]> {
  const listen = (server: http.Server, port: number) => new Promise<boolean>(resolve => {
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => resolve(true));
  });
  const probe = http.createServer();
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const next = (probe.address() as { port: number }).port + 1;
  await new Promise<void>(resolve => probe.close(() => resolve()));

  const held: http.Server[] = [];
  for (let port = next; port < next + count; port++) {
    const intruder = http.createServer((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ from: 'another program' }));
    });
    if (await listen(intruder, port)) held.push(intruder);
  }
  return held;
}

const closeAll = (servers: http.Server[]) =>
  Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));

describe('test HTTP servers (FT-151)', () => {
  let server: TestServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('get their own requests when another program holds the next ports on 127.0.0.1', async () => {
    const router = Router();
    router.get('/', (_req, res) => { res.json({ from: 'the test server' }); });

    // The ports are held only for one request: other test runs on this Mac must not meet them
    const intruders = await holdNextPorts(10);
    let res;
    try {
      server = await startTestServer({ '/ping': router });
      res = await server.request('GET', '/api/ping');
    } finally {
      await closeAll(intruders);
    }

    expect(res).toEqual({ status: 200, body: { from: 'the test server' } });
  });

  it('start the shared rate limiters with empty counters: one test never spends the next one\'s requests', async () => {
    const login = () => {
      const router = Router();
      router.post('/', strictRateLimiter, (_req, res) => { res.status(201).json({ success: true }); });
      return startTestServer({ '/login': router });
    };

    server = await login();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await server.request('POST', '/api/login')).status);
    // 10 per 15 minutes is the policy of the strict limiter; the test only checks it was spent
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(201));
    expect(statuses[10]).toBe(429);
    await server.close();

    server = await login();
    expect((await server.request('POST', '/api/login')).status).toBe(201);
  });

  it('are never started on every interface: each listens on 127.0.0.1, the address the tests call', () => {
    const testsDir = __dirname;
    // Port 0 with no host after it: `listen(0)`, `listen(0, callback)`. Use listenOnLoopback or startTestServer.
    const anyInterface = /\.listen\(\s*0\s*(?:\)|,(?!\s*['"`]))/;
    const offenders = (fs.readdirSync(testsDir, { recursive: true }) as string[])
      .filter(file => file.endsWith('.ts'))
      .flatMap(file => fs.readFileSync(path.join(testsDir, file), 'utf8')
        .split('\n')
        .map((line, index) => (anyInterface.test(line) ? `tests/${file}:${index + 1}` : null))
        .filter((place): place is string => place !== null));

    expect(offenders).toEqual([]);
  });
});
