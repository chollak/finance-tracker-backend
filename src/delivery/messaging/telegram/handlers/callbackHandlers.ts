import { Telegraf } from 'telegraf';
import { BotContext } from '../types';
import { RU } from '../i18n/ru';
import { formatConfirmedMessage } from '../formatters';
import {
  transactionConfirmedKeyboard,
  transactionEditKeyboard,
  getCategoryDisplay
} from '../keyboards';
import { createWebAppUrl } from '../utils';
import {
  getLastTransactionId,
  clearLastTransactionId
} from './messageHandlers';
import { AppError } from '../../../../shared/domain/errors/AppError';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TELEGRAM);

/**
 * Register callback query handlers
 */
export function registerCallbackHandlers(bot: Telegraf<BotContext>) {
  // Confirm transaction
  bot.action(/^confirm:(.+)$/, handleConfirm);

  // Edit transaction
  bot.action(/^edit:(.+)$/, handleEdit);

  // Delete transaction
  bot.action(/^delete:(.+)$/, handleDelete);

  // Quick add category selection
  bot.action(/^quickadd:(.+)$/, handleQuickAdd);

  // Back button (generic)
  bot.action('back', handleBack);
}

/**
 * Handle transaction confirmation
 */
async function handleConfirm(ctx: BotContext) {
  try {
    const match = (ctx as any).match;
    const transactionId = match?.[1];

    if (!transactionId) {
      await ctx.answerCbQuery(RU.errors.noTransactionFound);
      return;
    }

    await ctx.answerCbQuery(`✅ ${RU.transaction.confirmed}`);

    // Update message to show confirmed status
    const originalText = (ctx.callbackQuery?.message as any)?.text || '';
    const updatedText = formatConfirmedMessage(originalText);

    await ctx.editMessageText(updatedText, {
      parse_mode: 'HTML',
      ...transactionConfirmedKeyboard(transactionId),
    });
  } catch (error) {
    logger.error('Confirm callback error', error as Error);
    await ctx.answerCbQuery(RU.errors.generic);
  }
}

/**
 * Handle edit transaction request
 */
async function handleEdit(ctx: BotContext) {
  try {
    const match = (ctx as any).match;
    const transactionId = match?.[1];

    if (!transactionId) {
      await ctx.answerCbQuery(RU.errors.noTransactionFound);
      return;
    }

    const userId = String(ctx.from?.id ?? 'unknown');

    try {
      createWebAppUrl(userId, { edit: transactionId }); // Validate URL creation

      await ctx.answerCbQuery(`✏️ ${RU.buttons.edit}...`);

      // Send new message with edit button
      await ctx.reply(`✏️ ${RU.buttons.edit}`, transactionEditKeyboard(transactionId, userId));
    } catch (urlError) {
      await ctx.answerCbQuery(RU.errors.webAppNotConfigured);
    }
  } catch (error) {
    logger.error('Edit callback error', error as Error);
    await ctx.answerCbQuery(RU.errors.generic);
  }
}

/**
 * Handle transaction deletion
 */
async function handleDelete(ctx: BotContext) {
  try {
    const match = (ctx as any).match;
    const transactionId = match?.[1];

    if (!transactionId) {
      await ctx.answerCbQuery(RU.errors.noTransactionFound);
      return;
    }

    const userId = String(ctx.from?.id ?? 'unknown');

    // Security check - only allow deleting last transaction
    if (getLastTransactionId(userId) !== transactionId) {
      await ctx.answerCbQuery(RU.errors.cannotDelete);
      return;
    }

    const { transactionModule } = ctx.modules;

    // Delete the transaction
    await transactionModule.getDeleteTransactionUseCase().execute(transactionId);
    clearLastTransactionId(userId);

    // Remove inline keyboard from message
    await ctx.editMessageReplyMarkup(undefined);
    await ctx.answerCbQuery(`✅ ${RU.transaction.deleted}`);
  } catch (error) {
    logger.error('Delete callback error', error as Error, {
      userId: ctx.from?.id,
      transactionId: (ctx as any).match?.[1],
    });

    if (error instanceof AppError) {
      await ctx.answerCbQuery(`❌ ${error.message}`);
    } else {
      await ctx.answerCbQuery(RU.errors.generic);
    }
  }
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

    const categoryDisplay = getCategoryDisplay(categoryId);

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
