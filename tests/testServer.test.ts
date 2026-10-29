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

const HIGHEST_PORT = 65535;

/**
 * Plays another program of this Mac: holds the ports just ahead of the kernel's counter on 127.0.0.1. Adds each held
 * server to `held` as it goes, so the caller closes them even if this stops halfway.
 */
async function holdNextPorts(count: number, held: http.Server[]): Promise<void> {
  const listen = (server: http.Server, port: number) => new Promise<boolean>(resolve => {
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => resolve(true));
  });
  const probe = http.createServer();
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const next = (probe.address() as { port: number }).port + 1;
  await new Promise<void>(resolve => probe.close(() => resolve()));

  // Near the top of the range the counter wraps to 49152: fewer ports are held then, the test still runs
  for (let port = next; port < next + count && port <= HIGHEST_PORT; port++) {
    const intruder = http.createServer((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ from: 'another program' }));
    });
    if (await listen(intruder, port)) held.push(intruder);
  }
}

const closeAll = (servers: http.Server[]) =>
  Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));

/** The text between the parentheses of a call whose `(` is at `open`. */
function callArguments(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++;
    if (source[i] === ')' && --depth === 0) return source.slice(open + 1, i);
  }
  return source.slice(open + 1);
}

/**
 * Lines of `source` with a listen call that does not name 127.0.0.1 itself: no host, another host ('::', 'localhost'
 * — ::1 on macOS, the same bug), or a host in a variable the check cannot read. The host must be the literal
 * '127.0.0.1', as the second argument or as `host` of the options.
 */
function listensBeyondLoopback(source: string): number[] {
  const loopback = `['"\`]127\\.0\\.0\\.1['"\`]`;
  const asSecondArgument = new RegExp(`^[^,]*,\\s*${loopback}`);
  const asHostOption = new RegExp(`\\bhost\\s*:\\s*${loopback}`);
  return [...source.matchAll(/\.listen\s*\(/g)]
    .filter(match => {
      const args = callArguments(source, match.index! + match[0].length - 1);
      return !asSecondArgument.test(args) && !asHostOption.test(args);
    })
    .map(match => source.slice(0, match.index).split('\n').length);
}

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
    const intruders: http.Server[] = [];
    let res;
    try {
      await holdNextPorts(10, intruders);
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

  it.each([
    ['no arguments', 'app.listen();'],
    ['port 0 only', 'app.listen(0);'],
    ['a callback, no host', 'app.listen(0, () => resolve(listening));'],
    ['every IPv6 interface', "server.listen(0, '::', resolve);"],
    ['localhost (::1 on macOS)', "server.listen(0, 'localhost', resolve);"],
    ['options without a host', 'server.listen({ port: 0 });'],
    ['split over lines', 'app.listen(\n  0,\n  () => done()\n);'],
    ['a host the check cannot read', 'server.listen(0, HOST, resolve);'],
  ])('the guard catches a listen call with %s', (_case, source) => {
    expect(listensBeyondLoopback(`// test\n${source}`)).toEqual([2]);
  });

  it.each([
    ['port 0', "server.listen(0, '127.0.0.1', resolve);"],
    ['a chosen port', "server.listen(port, '127.0.0.1', () => resolve(true));"],
    ['options', "server.listen({ port: 0, host: '127.0.0.1' });"],
    ['split over lines', "server.listen(\n  0,\n  '127.0.0.1',\n  resolve\n);"],
  ])('the guard lets 127.0.0.1 through: %s', (_case, source) => {
    expect(listensBeyondLoopback(source)).toEqual([]);
  });

  it('are never started beyond 127.0.0.1, the address the tests call', () => {
    // Use listenOnLoopback or startTestServer, or name the host '127.0.0.1' in the call itself
    const testsDir = __dirname;
    // This file is left out: its guard examples above are wrong listen calls on purpose
    const offenders = (fs.readdirSync(testsDir, { recursive: true }) as string[])
      .filter(file => file.endsWith('.ts') && path.join(testsDir, file) !== __filename)
      .flatMap(file => listensBeyondLoopback(fs.readFileSync(path.join(testsDir, file), 'utf8'))
        .map(line => `tests/${file}:${line}`));

    expect(offenders).toEqual([]);
  });
});
