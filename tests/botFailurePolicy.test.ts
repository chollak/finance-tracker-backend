import { BOT_FAILURE_EXIT_CODE, createBotFailureHandler } from '../src/delivery/runtime/botFailurePolicy';

/**
 * FT-154: under systemd (`NODE_ENV=production`) a bot whose polling failed for good must not leave the process
 * running without it — `Restart=always` reacts only to the process exiting. Outside production the app keeps working
 * without the bot, as before.
 */

function fakeLogger() {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

const failed = { state: 'failed' as const, attempts: 5, lastError: '409: Conflict: terminated by other getUpdates request' };

describe('createBotFailureHandler', () => {
  it('in production shuts the process down with a non-zero code', () => {
    const shutdown = jest.fn().mockResolvedValue(undefined);
    const handle = createBotFailureHandler({ nodeEnv: 'production', shutdown, logger: fakeLogger() });

    handle(failed);

    expect(BOT_FAILURE_EXIT_CODE).not.toBe(0);
    expect(shutdown).toHaveBeenCalledWith('Telegram polling failed', BOT_FAILURE_EXIT_CODE);
  });

  it('in production logs the cause before exiting, so journald shows why the process went down', () => {
    const logger = fakeLogger();
    const handle = createBotFailureHandler({ nodeEnv: 'production', shutdown: jest.fn().mockResolvedValue(undefined), logger });

    handle(failed);

    expect(logger.error).toHaveBeenCalledWith(
      'Telegram bot is down for good; exiting so the supervisor restarts the process',
      null,
      { attempts: 5, lastError: failed.lastError, exitCode: BOT_FAILURE_EXIT_CODE }
    );
  });

  it.each(['development', 'test'])('in %s keeps the process running without the bot', (nodeEnv) => {
    const shutdown = jest.fn();
    const logger = fakeLogger();
    const handle = createBotFailureHandler({ nodeEnv, shutdown, logger });

    handle(failed);

    expect(shutdown).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('Application will continue without Telegram bot functionality', { lastError: failed.lastError });
  });
});
