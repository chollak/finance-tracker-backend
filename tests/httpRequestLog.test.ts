import { EventEmitter } from 'events';
import type { NextFunction, Request, Response } from 'express';
import { errorHandler, requestLogger } from '../src/delivery/web/express/middleware/errorMiddleware';
import { captureLogLines, LogCapture } from './helpers/logLines';

/**
 * #269: the HTTP log wrote `req.url`, query and all — and the history search sends what the user looks for there
 * (`/transactions/history?q=…`). The lines keep the path; the query stays out.
 */
const SEARCH = 'Алишер';

function request(): Request {
  return {
    method: 'GET',
    url: `/transactions/history?q=${encodeURIComponent(SEARCH)}`,
    path: '/transactions/history',
    body: {},
    params: {},
    ip: '127.0.0.1',
    get: () => 'jest',
  } as unknown as Request;
}

function response(): Response & EventEmitter {
  const res = new EventEmitter() as Response & EventEmitter;
  res.statusCode = 200;
  res.status = jest.fn(() => res) as unknown as Response['status'];
  res.json = jest.fn(() => res) as unknown as Response['json'];
  return res;
}

function expectNoQuery(lines: string[]): void {
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    expect(line).not.toContain(SEARCH);
    expect(line).not.toContain(encodeURIComponent(SEARCH));
    expect(line).not.toContain('?q=');
  }
}

describe('the HTTP log keeps the path, not the query (#269)', () => {
  let capture: LogCapture;

  beforeEach(() => {
    capture = captureLogLines();
  });

  afterEach(() => {
    capture.restore();
    jest.useRealTimers();
  });

  it('a request and its answer, a slow one too', async () => {
    // Only the clock: Winston's streams still deliver the lines
    jest.useFakeTimers({ now: new Date('2026-11-04T09:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    const res = response();
    const next = jest.fn() as NextFunction;

    requestLogger(request(), res, next);
    jest.setSystemTime(new Date('2026-11-04T09:00:06.000Z'));
    res.emit('finish');

    const lines = await capture.lines();
    expectNoQuery(lines);
    expect(lines.some(line => line.includes('GET /transactions/history - 200'))).toBe(true);
    expect(lines.some(line => line.includes('Slow request detected') && line.includes('/transactions/history'))).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it('a request that failed', async () => {
    const res = response();

    errorHandler(new Error('database is locked'), request(), res, jest.fn());

    const lines = await capture.lines();
    expectNoQuery(lines);
    expect(lines.some(line => line.includes('Express error handler') && line.includes('/transactions/history'))).toBe(true);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
