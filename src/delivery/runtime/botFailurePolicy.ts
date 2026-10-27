import { ILogger } from '../../shared/domain/ports/Logger';
import type { TelegramBotRuntimeStatus } from '../messaging/telegram/telegramBot';
import { Shutdown } from './gracefulShutdown';

/** Non-zero, so systemd's `Restart=` sees a failure. */
export const BOT_FAILURE_EXIT_CODE = 1;

export interface BotFailurePolicyDeps {
  nodeEnv: string;
  shutdown: Shutdown;
  logger: ILogger;
}

/**
 * What the process does when the bot's polling failed for good (FT-154). In production the live instance runs under
 * systemd, whose `Restart=` reacts only to the process exiting: a process alive without its bot would stay silent, so
 * it shuts down with a non-zero code and is started again. Outside production the app keeps working without the bot.
 */
export function createBotFailureHandler({ nodeEnv, shutdown, logger }: BotFailurePolicyDeps) {
  return (status: TelegramBotRuntimeStatus): void => {
    if (nodeEnv !== 'production') {
      logger.warn('Application will continue without Telegram bot functionality', { lastError: status.lastError });
      return;
    }

    logger.error('Telegram bot is down for good; exiting so the supervisor restarts the process', null, {
      attempts: status.attempts,
      lastError: status.lastError,
      exitCode: BOT_FAILURE_EXIT_CODE,
    });
    void shutdown('Telegram polling failed', BOT_FAILURE_EXIT_CODE);
  };
}
