import { MiddlewareFn } from 'telegraf';
import { BotContext } from '../types';
import { TelegramAccess } from '../../../../shared/domain/access/telegramAccess';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TELEGRAM);

/**
 * Closed access (FT-153): the bot is public in Telegram, so it serves only the Telegram ids in ALLOWED_TELEGRAM_IDS.
 * It runs before every other middleware: a message, a voice or a button press from anyone else creates no user,
 * reaches no OpenAI and writes nothing. The bot stays silent — an answer would only tell a stranger it is alive — and
 * the log names who was turned away. An update without a sender goes nowhere while the list is set.
 */
export function allowedUsersOnly(access: TelegramAccess): MiddlewareFn<BotContext> {
  return (ctx, next) => {
    if (access.allows(ctx.from?.id)) return next();
    logger.warn('Telegram update from a user who is not allowed ignored', { telegramId: ctx.from?.id, updateType: ctx.updateType });
    return Promise.resolve();
  };
}
