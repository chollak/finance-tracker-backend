import http from 'http';
import {
  BOT_STOP_GRACE_MS,
  closeHttpServer,
  createGracefulShutdown,
  HTTP_CLOSE_GRACE_MS,
  SHUTDOWN_TIMEOUT_MS,
} from '../src/delivery/runtime/gracefulShutdown';

/**
 * FT-154: one way out of the process — a signal (exit 0) or the bot failing for good in production (exit 1). The
 * schedulers stop first, then the bot and the HTTP server stop taking work and finish what they have (FT-167), then
 * the database closes; a step that throws does not keep the next ones from running, and a step that hangs does not
 * keep the process alive.
 */

function fakeLogger() {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function fakeSteps() {
  const order: string[] = [];
  return {
    order,
    steps: {
      stopSchedulers: jest.fn(() => { order.push('schedulers'); }),
      stopBot: jest.fn(async () => { order.push('bot'); }),
      closeHttpServer: jest.fn(async () => { order.push('http'); }),
      closeDatabase: jest.fn(async () => { order.push('database'); }),
    },
  };
}

describe('createGracefulShutdown', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('stops the schedulers, the bot and the HTTP server, closes the database, then exits with the given code', async () => {
    const { order, steps } = fakeSteps();
    const exit = jest.fn();
    const shutdown = createGracefulShutdown(steps, { exit, logger: fakeLogger() });

    await shutdown('Telegram polling failed', 1);

    expect(order).toEqual(['schedulers', 'bot', 'http', 'database']);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('logs why it shuts down and with which code, so the journal shows the reason', async () => {
    const logger = fakeLogger();
    const shutdown = createGracefulShutdown(fakeSteps().steps, { exit: jest.fn(), logger });

    await shutdown('SIGTERM', 0);

    expect(logger.info).toHaveBeenCalledWith('Shutting down', { reason: 'SIGTERM', exitCode: 0 });
  });

  it('a step that throws is logged and the next steps still run', async () => {
    const { order, steps } = fakeSteps();
    steps.closeHttpServer.mockRejectedValueOnce(new Error('Server is not running'));
    const logger = fakeLogger();
    const exit = jest.fn();
    const shutdown = createGracefulShutdown(steps, { exit, logger });

    await shutdown('SIGTERM', 0);

    expect(order).toEqual(['schedulers', 'bot', 'database']);
    expect(logger.error).toHaveBeenCalledWith('Shutdown step failed', expect.any(Error), { step: 'closeHttpServer' });
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('a step that hangs does not keep the process alive: it exits after the timeout with the same code', async () => {
    jest.useFakeTimers();
    const { steps } = fakeSteps();
    let finishClosing: () => void = () => undefined;
    steps.closeDatabase.mockImplementationOnce(() => new Promise<void>(resolve => { finishClosing = () => { resolve(); }; }));
    const logger = fakeLogger();
    const exit = jest.fn();
    const shutdown = createGracefulShutdown(steps, { exit, logger, timeoutMs: 5_000 });

    const done = shutdown('Telegram polling failed', 1);
    await jest.advanceTimersByTimeAsync(4_999);
    expect(exit).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith('Shutdown timed out, exiting anyway', null, expect.objectContaining({ timeoutMs: 5_000 }));

    // The hung step finishing later does not exit a second time
    finishClosing();
    await done;
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('waits 10 seconds by default', () => {
    expect(SHUTDOWN_TIMEOUT_MS).toBe(10_000);
  });

  describe('the bot (FT-167)', () => {
    function deferred() {
      let resolve: () => void = () => undefined;
      const promise = new Promise<void>(done => { resolve = done; });
      return { promise, resolve };
    }
    const flush = () => new Promise(resolve => setImmediate(resolve));

    it('closes the database only once the bot has finished the updates it is handling', async () => {
      const { order, steps } = fakeSteps();
      const handling = deferred();
      steps.stopBot.mockImplementationOnce(async () => { await handling.promise; order.push('bot'); });
      const exit = jest.fn();
      const shutdown = createGracefulShutdown(steps, { exit, logger: fakeLogger() });

      const done = shutdown('SIGTERM', 0);
      await flush();
      expect(steps.closeDatabase).not.toHaveBeenCalled();

      handling.resolve();
      await done;
      expect(order.indexOf('bot')).toBeLessThan(order.indexOf('database'));
      expect(exit).toHaveBeenCalledWith(0);
    });

    it('stops the bot and the HTTP server at once, so their grace periods do not add up', async () => {
      const { steps } = fakeSteps();
      const handling = deferred();
      steps.stopBot.mockImplementationOnce(() => handling.promise);
      const shutdown = createGracefulShutdown(steps, { exit: jest.fn(), logger: fakeLogger() });

      const done = shutdown('SIGTERM', 0);
      await flush();
      expect(steps.closeHttpServer).toHaveBeenCalledTimes(1);

      handling.resolve();
      await done;
    });

    it('a bot that cannot stop is logged and the database still closes', async () => {
      const { order, steps } = fakeSteps();
      steps.stopBot.mockRejectedValueOnce(new Error('Bot is not running!'));
      const logger = fakeLogger();
      const shutdown = createGracefulShutdown(steps, { exit: jest.fn(), logger });

      await shutdown('SIGTERM', 0);

      expect(order).toEqual(['schedulers', 'http', 'database']);
      expect(logger.error).toHaveBeenCalledWith('Shutdown step failed', expect.any(Error), { step: 'stopBot' });
    });

    it('gives the updates in flight 5 seconds, so the database closes well before the 10-second timeout', () => {
      expect(BOT_STOP_GRACE_MS).toBe(5_000);
      expect(Math.max(BOT_STOP_GRACE_MS, HTTP_CLOSE_GRACE_MS)).toBeLessThan(SHUTDOWN_TIMEOUT_MS);
    });
  });

  it('a second call while shutting down is ignored: a signal during a failure exit does not change its code', async () => {
    const { steps } = fakeSteps();
    const exit = jest.fn();
    const shutdown = createGracefulShutdown(steps, { exit, logger: fakeLogger() });

    await Promise.all([shutdown('Telegram polling failed', 1), shutdown('SIGTERM', 0)]);

    expect(steps.closeDatabase).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('closeHttpServer', () => {
  it('resolves once the server stopped listening', async () => {
    const server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

    await closeHttpServer(server);

    expect(server.listening).toBe(false);
  });

  it('cuts a request still open after the grace period, so the database gets its turn before the timeout', async () => {
    const server = http.createServer(() => { /* never answers */ });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    const request = http.get(`http://127.0.0.1:${port}/`);
    request.on('error', () => undefined);
    await new Promise<void>(resolve => server.once('request', () => resolve()));

    await closeHttpServer(server, 50);

    expect(server.listening).toBe(false);
  });

  it('gives open requests 5 seconds by default', () => {
    expect(HTTP_CLOSE_GRACE_MS).toBe(5_000);
  });

  it('rejects when the server is not running', async () => {
    const server = http.createServer();

    await expect(closeHttpServer(server)).rejects.toThrow();
  });
});
