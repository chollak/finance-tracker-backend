/**
 * Payment Handlers
 * Telegram bot handlers for Stars payment flow
 */

import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { SubscriptionModule } from '../../../../modules/subscription/subscriptionModule';
import { TelegramPaymentService } from '../../../../modules/subscription/infrastructure/TelegramPaymentService';
import { SUBSCRIPTION_PRICE_STARS } from '../../../../modules/subscription/domain/subscription';
import { BotContext } from '../types';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TELEGRAM);

/**
 * Helper to get user UUID from telegram ID
 */
async function getUserId(ctx: BotContext): Promise<string> {
  const telegramId = String(ctx.from!.id);
  const user = await ctx.modules.userModule.getGetOrCreateUserUseCase().execute({
    telegramId,
    userName: ctx.from?.username,
    firstName: ctx.from?.first_name,
    lastName: ctx.from?.last_name,
    languageCode: ctx.from?.language_code,
  });
  return user.id;
}

export function registerPaymentHandlers(
  bot: Telegraf<BotContext>,
  subscriptionModule: SubscriptionModule,
  paymentService: TelegramPaymentService
): void {
  // Command to show subscription info and buy button
  bot.command('premium', async (ctx) => {
    try {
      const userId = await getUserId(ctx);
      const status = await subscriptionModule
        .getGetSubscriptionUseCase()
        .execute(userId);

      if (status.isPremium) {
        let message = '⭐ *У вас Premium подписка!*\n\n';

        if (status.subscription?.source === 'lifetime') {
          message += '🎁 Тип: Пожизненный доступ\n';
        } else if (status.subscription?.source === 'gift') {
          message += '🎁 Тип: Подарок\n';
          if (status.subscriptionDaysLeft !== null) {
            message += `⏳ Осталось: ${status.subscriptionDaysLeft} дней\n`;
          }
        } else if (status.subscription?.source === 'trial') {
          message += '🆓 Тип: Пробный период\n';
          if (status.trialDaysLeft !== null) {
            message += `⏳ Осталось: ${status.trialDaysLeft} дней\n`;
          }
        } else {
          if (status.subscriptionDaysLeft !== null) {
            message += `⏳ Осталось: ${status.subscriptionDaysLeft} дней\n`;
          }
        }

        message += '\n✅ Все функции разблокированы!';

        await ctx.reply(message, { parse_mode: 'Markdown' });
      } else {
        const limits = status.limits;

        let message = '📊 *Ваш текущий план: Free*\n\n';
        message += '*Использование в этом месяце:*\n';
        // A null limit means limits are switched off (FT-091): show usage without a ceiling.
        const usage = (used: number, limit: number | null) => (limit === null ? `${used} · без лимита` : `${used}/${limit}`);
        message += `📝 Транзакции: ${usage(limits.transactions.used, limits.transactions.limit)}\n`;
        message += `🎤 Голосовые: ${usage(limits.voiceInputs.used, limits.voiceInputs.limit)}\n`;
        message += `💰 Активные долги: ${usage(limits.activeDebts.used, limits.activeDebts.limit)}\n`;
        message += `\n⭐ *Premium (${SUBSCRIPTION_PRICE_STARS} Stars/мес):*\n`;
        message += '✅ Безлимитные транзакции\n';
        message += '✅ Безлимитные голосовые\n';
        message += '✅ Безлимитные долги\n';
        message += '✅ Полная аналитика\n';
        message += '\nНажмите кнопку ниже для оплаты:';

        await ctx.reply(message, {
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
        });
      }
    } catch (error) {
      logger.error('/premium command error', error as Error);
      await ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
  });

  // Callback for buy button
  bot.action('buy_premium', async (ctx) => {
    await ctx.answerCbQuery();

    const chatId = ctx.chat!.id;

    try {
      // Get user UUID for payment payload
      const userId = await getUserId(ctx);

      await paymentService.sendPremiumInvoice({
        chatId,
        userId,
      });
    } catch (error) {
      logger.error('Error sending invoice', error as Error);
      await ctx.reply('Не удалось создать счет. Попробуйте позже.');
    }
  });

  // CRITICAL: Must respond to pre_checkout_query within 10 seconds!
  bot.on('pre_checkout_query', async (ctx) => {
    try {
      const payload = paymentService.parsePayload(ctx.preCheckoutQuery.invoice_payload);

      if (!payload) {
        await ctx.answerPreCheckoutQuery(false, 'Неверные данные платежа');
        return;
      }

      // Validate payload
      if (payload.type !== 'premium') {
        await ctx.answerPreCheckoutQuery(false, 'Неизвестный тип подписки');
        return;
      }

      // All checks passed, approve the payment
      await ctx.answerPreCheckoutQuery(true);
    } catch (error) {
      logger.error('pre_checkout_query error', error as Error);
      // CRITICAL: Always respond, even on error
      await ctx.answerPreCheckoutQuery(false, 'Ошибка обработки платежа');
    }
  });

  // Handle successful payment
  bot.on(message('successful_payment'), async (ctx) => {
    try {
      const payment = ctx.message.successful_payment;

      const payload = paymentService.parsePayload(payment.invoice_payload);

      if (!payload) {
        logger.error('Failed to parse successful_payment payload');
        await ctx.reply('Платеж получен, но произошла ошибка активации. Обратитесь в поддержку.');
        return;
      }

      // Get user UUID
      const userId = await getUserId(ctx);

      // CRITICAL: Save charge IDs for potential refunds
      const telegramPaymentChargeId = payment.telegram_payment_charge_id;
      const providerPaymentChargeId = payment.provider_payment_charge_id;

      // Create subscription
      const subscription = await subscriptionModule
        .getCreateSubscriptionUseCase()
        .execute({
          userId,
          tier: 'premium',
          source: 'payment',
          priceStars: payment.total_amount,
          telegramPaymentChargeId,
          providerPaymentChargeId,
        });

      logger.info('Subscription created', { userId, subscriptionId: subscription.id });

      await ctx.reply(
        '🎉 *Спасибо за покупку Premium!*\n\n' +
          'Теперь вам доступны:\n' +
          '✅ Безлимитные транзакции\n' +
          '✅ Безлимитные голосовые\n' +
          '✅ Безлимитные долги\n' +
          '✅ Полная аналитика\n\n' +
          'Приятного использования! 🚀',
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Error processing successful payment', error as Error);
      await ctx.reply(
        'Платеж получен, но произошла ошибка активации подписки. ' +
          'Пожалуйста, обратитесь в поддержку с ID платежа.'
      );
    }
  });

  // Command to cancel subscription
  bot.command('cancel_subscription', async (ctx) => {
    try {
      // Get user UUID
      const userId = await getUserId(ctx);

      const result = await subscriptionModule
        .getCancelSubscriptionUseCase()
        .execute({ userId });

      await ctx.reply(result.message);
    } catch (error) {
      logger.error('Error cancelling subscription', error as Error);
      await ctx.reply('Произошла ошибка при отмене подписки.');
    }
  });
}
