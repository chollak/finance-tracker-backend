import { Telegraf } from 'telegraf';
import { BotContext } from '../types';
import { RU } from '../i18n/ru';
import { botUserId, quickAddCategory } from '../utils/userCategories';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TELEGRAM);

/**
 * Register callback query handlers. The buttons under record messages — and «Изменить», «Удалить»,
 * «Подтвердить» of confirmations sent before FT-122 — are in recordHandlers.
 */
export function registerCallbackHandlers(bot: Telegraf<BotContext>) {
  // Quick add category selection
  bot.action(/^quickadd:(.+)$/, handleQuickAdd);

  // Back button (generic)
  bot.action('back', handleBack);
}

/**
 * Handle quick add category selection
 */
async function handleQuickAdd(ctx: BotContext) {
  try {
    const match = (ctx as any).match;
    const categoryId = match?.[1];

    if (!categoryId) {
      await ctx.answerCbQuery(RU.errors.generic);
      return;
    }

    // A category id, or an old static id from a button sent before FT-099
    const { name: categoryDisplay } = await quickAddCategory(ctx, await botUserId(ctx), categoryId);

    await ctx.answerCbQuery();

    // Ask user for amount
    await ctx.reply(RU.quickCategories.enterAmount(categoryDisplay), {
      parse_mode: 'HTML',
      reply_markup: {
        force_reply: true,
        selective: true,
        input_field_placeholder: 'Введите сумму...',
      },
    });

    // Store pending action in session
    if (ctx.session) {
      ctx.session.pendingAction = {
        type: 'awaiting_amount',
        category: categoryId,
      };
    }
  } catch (error) {
    logger.error('Quick add callback error', error as Error);
    await ctx.answerCbQuery(RU.errors.generic);
  }
}

/**
 * Handle back button
 */
async function handleBack(ctx: BotContext) {
  try {
    await ctx.answerCbQuery();
    await ctx.deleteMessage();
  } catch (error) {
    // Ignore errors when deleting message
  }
}
