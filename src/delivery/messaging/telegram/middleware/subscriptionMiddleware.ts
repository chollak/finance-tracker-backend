/**
 * Subscription Middleware for Telegram Bot
 * Checks limits before processing voice/text input
 */

import { Context, Middleware } from 'telegraf';
import { SubscriptionModule } from '../../../../modules/subscription/subscriptionModule';
import { LimitType } from '../../../../modules/subscription/domain/usageLimit';
import { SUBSCRIPTION_PRICE_STARS } from '../../../../modules/subscription/domain/subscription';

// Extend Context to include subscription info
interface SubscriptionContext extends Context {
  subscriptionInfo?: {
    isPremium: boolean;
    allowed: boolean;
    currentUsage: number;
    limit: number | null;
    remaining: number | null;
  };
}

/**
 * Create middleware to check limit before action
 */
export function createTelegramCheckLimitMiddleware(
  subscriptionModule: SubscriptionModule,
  limitType: LimitType
): Middleware<SubscriptionContext> {
  return async (ctx, next) => {
    if (!ctx.from) {
      return next();
    }

    const userId = String(ctx.from.id);

    try {
      const result = await subscriptionModule
        .getCheckLimitUseCase()
        .execute({ userId, limitType });

      // Attach info to context
      ctx.subscriptionInfo = {
        isPremium: result.isPremium,
        allowed: result.allowed,
        currentUsage: result.currentUsage,
        limit: result.limit,
        remaining: result.remaining,
      };

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
        return; // Don't proceed with action
      }

      return next();
    } catch (error) {
      console.error('Error in telegram subscription middleware:', error);
      // Allow action on error (fail open)
      return next();
    }
  };
}

/**
 * Create middleware to increment usage after successful action
 */
export function createTelegramIncrementUsageMiddleware(
  subscriptionModule: SubscriptionModule,
  limitType: LimitType
): Middleware<SubscriptionContext> {
  return async (ctx, next) => {
    // Execute the action first
    await next();

    // Then increment usage (fire and forget)
    if (ctx.from) {
      const userId = String(ctx.from.id);
      try {
        await subscriptionModule
          .getIncrementUsageUseCase()
          .execute({ userId, limitType });
      } catch (error) {
        console.error('Failed to increment usage in telegram middleware:', error);
      }
    }
  };
}

/**
 * Middleware to check if user has premium before analytics
 */
export function createTelegramRequirePremiumMiddleware(
  subscriptionModule: SubscriptionModule
): Middleware<SubscriptionContext> {
  return async (ctx, next) => {
    if (!ctx.from) {
      return next();
    }

    const userId = String(ctx.from.id);

    try {
      const isPremium = await subscriptionModule
        .getSubscriptionService()
        .isPremium(userId);

      if (!isPremium) {
        await ctx.reply(
          '⭐ *Эта функция доступна только для Premium пользователей*\n\n' +
            'Оформите подписку, чтобы получить доступ к:\n' +
            '📊 Полной аналитике расходов\n' +
            '📈 Детальным отчетам\n' +
            '🎯 Рекомендациям по бюджету\n\n' +
            `Цена: ${SUBSCRIPTION_PRICE_STARS} Stars/месяц`,
          {
            parse_mode: 'Markdown',
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
        return;
      }

      return next();
    } catch (error) {
      console.error('Error in telegram premium middleware:', error);
      // Allow action on error (fail open)
      return next();
    }
  };
}

/**
 * Show remaining usage warning after action (optional)
 */
export function createUsageWarningMiddleware(
  subscriptionModule: SubscriptionModule,
  limitType: LimitType,
  warningThreshold: number = 5 // Show warning when remaining <= threshold
): Middleware<SubscriptionContext> {
  return async (ctx, next) => {
    await next();

    if (!ctx.from || ctx.subscriptionInfo?.isPremium) {
      return;
    }

    const remaining = ctx.subscriptionInfo?.remaining;

    if (remaining !== null && remaining !== undefined && remaining <= warningThreshold && remaining > 0) {
      const limitName = getLimitName(limitType);
      await ctx.reply(
        `⚠️ У вас осталось ${remaining} ${limitName} в этом месяце.\n` +
          `Оформите Premium для безлимита!`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `⭐ Premium (${SUBSCRIPTION_PRICE_STARS} Stars)`,
                  callback_data: 'buy_premium',
                },
              ],
            ],
          },
        }
      );
    }
  };
}

function getLimitName(limitType: LimitType): string {
  switch (limitType) {
    case 'transactions':
      return 'транзакций';
    case 'voice_inputs':
      return 'голосовых сообщений';
    case 'debts':
      return 'активных долгов';
  }
}
