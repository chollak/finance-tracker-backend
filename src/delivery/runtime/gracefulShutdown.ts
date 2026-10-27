import http from 'http';
import { ILogger } from '../../shared/domain/ports/Logger';

/** Under systemd's default `TimeoutStopSec` (90 s), so a hung close is ours to end, not SIGKILL's. */
export const SHUTDOWN_TIMEOUT_MS = 10_000;

/** What the process closes on its way out, in this order. */
export interface ShutdownSteps {
  /** Timers that start work on their own: the bot's notices, the USD rate refresh. */
  stopSchedulers: () => void;
  /** No new requests; the open ones finish (bounded by the timeout). */
  closeHttpServer: () => Promise<void>;
  closeDatabase: () => Promise<void>;
}

export interface ShutdownOptions {
  exit: (code: number) => void;
  logger: ILogger;
  timeoutMs?: number;
}

export type Shutdown = (reason: string, exitCode: number) => Promise<void>;

/**
 * One way out of the process (FT-154): a signal exits 0, the bot failing for good in production exits non-zero.
 * A step that throws is logged and the next one still runs; a step that hangs is cut off by the timeout, which exits
 * with the same code. Only the first call counts — a SIGTERM during a failure exit does not turn it into exit 0.
 */
export function createGracefulShutdown(steps: ShutdownSteps, options: ShutdownOptions): Shutdown {
  const { exit, logger, timeoutMs = SHUTDOWN_TIMEOUT_MS } = options;
  let started = false;
  let exited = false;

  const exitOnce = (code: number) => {
    if (exited) return;
    exited = true;
    exit(code);
  };

  const runStep = async (name: keyof ShutdownSteps) => {
    try {
      await steps[name]();
    } catch (error) {
      logger.error('Shutdown step failed', error instanceof Error ? error : new Error(String(error)), { step: name });
    }
  };

  return async (reason, exitCode) => {
    if (started) {
      logger.warn('Shutdown already in progress', { reason });
      return;
    }
    started = true;
    logger.info('Shutting down', { reason, exitCode });

    // Not unref'd: if a close hangs on a promise with no handle left, the process must still leave with this code
    const timer = setTimeout(() => {
      logger.error('Shutdown timed out, exiting anyway', null, { reason, exitCode, timeoutMs });
      exitOnce(exitCode);
    }, timeoutMs);

    await runStep('stopSchedulers');
    await runStep('closeHttpServer');
    await runStep('closeDatabase');

    clearTimeout(timer);
    if (!exited) logger.info('Shutdown complete', { reason, exitCode });
    exitOnce(exitCode);
  };
}

/** Half of the shutdown timeout: open requests get this long, then the database still has time to close. */
export const HTTP_CLOSE_GRACE_MS = 5_000;

/**
 * `server.close()` as a promise: no new connections, idle keep-alive ones dropped (Node 19+). A request still open
 * after `graceMs` is cut, so a slow upload cannot use up the whole shutdown timeout before the database closes.
 */
export function closeHttpServer(server: http.Server, graceMs: number = HTTP_CLOSE_GRACE_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const cut = setTimeout(() => server.closeAllConnections(), graceMs);
    cut.unref();
    server.close(error => {
      clearTimeout(cut);
      if (error) reject(error);
      else resolve();
    });
  });
}
