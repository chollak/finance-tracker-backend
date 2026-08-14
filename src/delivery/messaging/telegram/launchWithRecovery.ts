import { getLogger, LogCategory } from '../../../shared/application/logging';

const logger = getLogger(LogCategory.TELEGRAM);

export interface LaunchWithRecoveryOptions {
  /**
   * Starts polling. Telegraf's launch() resolves when polling *stops*, so a
   * promise that never settles means the bot is running normally.
   */
  launch: () => Promise<unknown>;
  wait?: (ms: number) => Promise<void>;
  /**
   * How long to let a launch prove itself before calling the bot running.
   * Telegraf rejects on 409 shortly after launch() returns, not synchronously,
   * so without this pause a failed start would be reported as a success.
   */
  grace?: () => Promise<void>;
  maxAttempts?: number;
  onRunning?: () => void;
  onExhausted?: (error: unknown) => void;
}

export interface LaunchState {
  isRunning: () => boolean;
  recovered: boolean;
  /**
   * Settles once the outcome is known: polling started, or attempts exhausted.
   * Kept as a separate field rather than making the state itself thenable —
   * resolving a promise with a thenable makes the runtime call its `then`
   * recursively, which deadlocks.
   */
  settled: Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Keeps the bot polling across transient failures.
 *
 * A single conflicting getUpdates — another instance starting, a stray probe —
 * used to disable the bot until the process was restarted. The failure was
 * logged as a warning and the API kept answering 200, so from outside nothing
 * looked wrong: the bot was simply deaf.
 *
 * Two things are deliberate here. Running is reported when polling *starts*,
 * not when launch() settles, because it settles on shutdown. And exhausting
 * the attempts is an error, not a warning: at that point the product's main
 * input is gone.
 */
export function launchWithRecovery(options: LaunchWithRecoveryOptions): LaunchState {
  const {
    launch,
    wait = sleep,
    grace = () => sleep(1_000),
    maxAttempts = 5,
    onRunning,
    onExhausted,
  } = options;

  let running = false;
  let settle: () => void = () => {};
  const settled = new Promise<void>((resolve) => { settle = resolve; });

  const state: LaunchState = { isRunning: () => running, recovered: false, settled };

  const attemptLoop = async (): Promise<void> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const polling = launch();

        // launch() returns a promise that rejects on a failed start rather than
        // throwing, so give it a moment to fail before declaring success.
        let startupError: unknown = null;
        let stopped = false;
        polling.then(() => { stopped = true; }, (error) => { startupError = error; });
        await grace();
        if (startupError) throw startupError;

        // A promise still pending means polling is up; resolving means it ended.
        running = !stopped;
        if (attempt === 1) {
          onRunning?.();
          logger.info('Telegram bot polling started');
        } else {
          state.recovered = true;
          onRunning?.();
          logger.info('Telegram bot polling recovered', { attempt });
        }
        settle();

        await polling;
        running = false;
        logger.warn('Telegram bot polling stopped', { attempt });
        return;
      } catch (error) {
        running = false;
        const backoffMs = Math.min(30_000, 2_000 * 2 ** (attempt - 1));
        logger.warn('Telegram bot polling failed, retrying', {
          attempt,
          maxAttempts,
          backoffMs,
          reason: error instanceof Error ? error.message : String(error),
        });
        await wait(backoffMs);

        if (attempt === maxAttempts) {
          logger.error(
            'Telegram bot could not start after repeated attempts; the product has no message input until this is fixed',
            error instanceof Error ? error : new Error(String(error))
          );
          onExhausted?.(error);
          settle();
          return;
        }
      }
    }
    settle();
  };

  void attemptLoop();

  return state;
}
