import { RequestHandler } from 'express';
import { AppConfig } from '../../../../shared/infrastructure/config/appConfig';
import type { TelegramBotRuntimeStatus } from '../../../messaging/telegram/telegramBot';

/**
 * `GET /api/health` (FT-154): 503 when the bot's polling failed for good, so a check that reads only the status code
 * sees it; 200 while the bot starts, retries a 409, runs or is switched off. The webapp's offline mode reads this
 * route only to know whether the server answers — its own JSON 503 counts as an answer there.
 */
export function createHealthHandler(getBotStatus: () => TelegramBotRuntimeStatus): RequestHandler {
  return (_req, res) => {
    const telegramBot = getBotStatus();
    const healthy = telegramBot.state !== 'failed';

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: AppConfig.NODE_ENV,
      telegramBot,
    });
  };
}
