/**
 * Subscription Middleware for Telegram Bot
 * Checks limits before processing voice/text input
 */

import { Context, Middleware } from 'telegraf';
import { SubscriptionModule } from '../../../../modules/subscription/subscriptionModule';
import { UserModule } from '../../../../modules/user/userModule';
import { LimitType } from '../../../../modules/subscription/domain/usageLimit';
import { SUBSCRIPTION_PRICE_STARS } from '../../../../modules/subscription/domain/subscription';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.SUBSCRIPTION);

/**
 * Helper to get user UUID from telegram context
 */
async function getUserUUID(ctx: Context, userModule: UserModule): Promise<string | null> {
  if (!ctx.from) return null;

  try {
    const user = await userModule.getGetOrCreateUserUseCase().execute({
      telegramId: String(ctx.from.id),
      userName: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
      languageCode: ctx.from.language_code,
    });
    return user.id;
  } catch (error) {
    logger.error('Failed to get user UUID', error as Error);
    return null;
  }
}

/**
 * Whether the user may go on with an action that counts against the limit; when not, the paywall is sent.
 * Fails open: an error while checking lets the action go on. Used by the middleware below and by an answer
 * that adds a record outside it — «Сколько?» of an item named without an amount (FT-123).
 */
export async function checkTelegramLimit(
  ctx: Context,
  subscriptionModule: SubscriptionModule,
  userId: string,
  limitType: LimitType
): Promise<boolean> {
  try {
    const result = await subscriptionModule
      .getCheckLimitUseCase()
      .execute({ userId, limitType });

    if (!result.allowed) {
      // Send paywall message
      await ctx.reply(
        `⚠️ ${result.message}\n\n` +
          `Используйте /premium для оплаты (${SUBSCRIPTION_PRICE_STARS} Stars).`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `⭐ Купить Premium (${SUBSCRIPTION_PRICE_STARS} Stars)`,
                  callback_data: 'buy_premium',
                },
              ],
            ],
          },
        }
      );
      return false; // Don't proceed with action
    }

    return true;
  } catch (error) {
    logger.error('Error in telegram subscription middleware', error as Error);
    // Allow action on error (fail open)
    return true;
  }
}

/**
 * Create middleware to check limit before action.
 * Fails open too: without a sender, or when the user cannot be resolved, the action goes on unchecked.
 */
export function createTelegramCheckLimitMiddleware(
  subscriptionModule: SubscriptionModule,
  userModule: UserModule,
  limitType: LimitType
): Middleware<Context> {
  return async (ctx, next) => {
    if (!ctx.from) {
      return next();
    }

    const userId = await getUserUUID(ctx, userModule);
    if (!userId) {
      return next(); // Fail open if can't get user
    }

    if (await checkTelegramLimit(ctx, subscriptionModule, userId, limitType)) return next();
  };
}
