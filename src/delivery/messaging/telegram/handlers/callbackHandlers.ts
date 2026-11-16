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
 * The answer to a press. Telegram refuses it for a press it no longer waits on — the bot was down or behind a long
 * update («query is too old»); the spinner goes by itself then, and the refusal must not reach `bot.catch`, which
 * would tell the chat «Произошла ошибка» (#281).
 */
async function answerPress(ctx: BotContext, text?: string): Promise<void> {
  await ctx.answerCbQuery(text).catch(() => undefined);
}

/**
 * Handle quick add category selection
 */
async function handleQuickAdd(ctx: BotContext) {
  try {
    const match = (ctx as any).match;
    const categoryId = match?.[1];

    if (!categoryId) {
      await answerPress(ctx, RU.errors.generic);
      return;
    }

    // A category id, or an old static id from a button sent before FT-099
    const { name: categoryDisplay } = await quickAddCategory(ctx, await botUserId(ctx), categoryId);

    await answerPress(ctx);

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
    await answerPress(ctx, RU.errors.generic);
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
