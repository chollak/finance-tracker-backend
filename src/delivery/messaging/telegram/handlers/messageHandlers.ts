import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { BotContext } from '../types';
import { RU, formatAmount } from '../i18n/ru';
import { downloadVoiceFile, cleanupFile } from '../utils';
import { quickAddCategory } from '../utils/userCategories';
import { guessedIds, sendRecordMessage } from '../utils/recordMessageView';
import { answerAmountQuestion } from './recordHandlers';
import { AppError } from '../../../../shared/domain/errors/AppError';
import { DetectedDebt } from '../../../../modules/voiceProcessing/domain/processedTransaction';
import { SubscriptionModule } from '../../../../modules/subscription/subscriptionModule';
import { UserModule } from '../../../../modules/user/userModule';
import {
  createTelegramCheckLimitMiddleware,
} from '../middleware/subscriptionMiddleware';
import { resolveUserIdToUUID } from '../../../../shared/application/helpers/userIdResolver';
import { LimitType } from '../../../../modules/subscription/domain/usageLimit';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';
import { toCapturedTransaction } from '../../../../modules/quickCapture/application/toCapturedTransaction';

const logger = createLogger(LogCategory.TELEGRAM_MSG);

async function sendProcessingFeedback(ctx: BotContext): Promise<void> {
  try {
    await ctx.sendChatAction('typing');
  } catch {
    // Best-effort UX feedback only; processing must continue even if Telegram rejects chat action.
  }
}

/**
 * Helper to increment usage counter (fire and forget)
 */
async function incrementUsage(
  subscriptionModule: SubscriptionModule | undefined,
  userId: string,
  limitType: LimitType
): Promise<void> {
  if (!subscriptionModule) return;

  try {
    await subscriptionModule.getIncrementUsageUseCase().execute({ userId, limitType });
  } catch (error) {
    logger.error(`Failed to increment ${limitType} usage`, error as Error);
  }
}

/**
 * Register message handlers with subscription limit checks
 */
export function registerMessageHandlers(
  bot: Telegraf<BotContext>,
  subscriptionModule?: SubscriptionModule,
  userModule?: UserModule
) {
  // Voice inputs are counted inside the voice handler; created transactions are counted by
  // CreateTransactionUseCase.
  const textHandler = createTextMessageHandler(userModule, subscriptionModule);
  const voiceHandler = createVoiceMessageHandler(userModule, subscriptionModule);

  // If subscription module is provided, apply limit checking middleware
  if (subscriptionModule && userModule) {
    const checkTransactionLimit = createTelegramCheckLimitMiddleware(
      subscriptionModule,
      userModule,
      'transactions'
    );
    const checkVoiceLimit = createTelegramCheckLimitMiddleware(
      subscriptionModule,
      userModule,
      'voice_inputs'
    );

    // Text message handler with limit check
    bot.on(
      message('text'),
      checkTransactionLimit,
      textHandler
    );

    // Voice message handler with limit check
    bot.on(
      message('voice'),
      checkVoiceLimit,
      voiceHandler
    );
  } else {
    // Fallback without subscription checks
    bot.on(message('text'), textHandler);
    bot.on(message('voice'), voiceHandler);
  }
}

/**
 * Create text message handler with userModule for userId resolution
 */
// Text capture no longer counts usage itself (CreateTransactionUseCase does); the second parameter is
// kept so the handler factories share one signature.
export function createTextMessageHandler(userModule?: UserModule, _subscriptionModule?: SubscriptionModule) {
  return async function handleTextMessage(ctx: BotContext) {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';

    // Skip commands
    if (text.startsWith('/')) return;

    const telegramId = String(ctx.from?.id ?? 'unknown');
    const userName = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim() || 'User';

    // Resolve telegramId to UUID if userModule is available
    let userId = telegramId;
    if (userModule) {
      try {
        userId = await resolveUserIdToUUID(telegramId, userModule);
      } catch (error) {
        logger.error('Failed to resolve userId in text handler', error as Error);
      }
    }

    try {
      // Handle Quick Add - awaiting amount after category selection
      if (ctx.session?.pendingAction?.type === 'awaiting_amount') {
        await sendProcessingFeedback(ctx);
        await handleQuickAddAmount(ctx, text, userId, userName);
        return;
      }

      if (!text || text.trim().length === 0) {
        await ctx.reply(RU.errors.emptyMessage);
        return;
      }

      // «Сумму» under a record waits for the amount as the next text (FT-122)
      if (await answerAmountQuestion(ctx, text, userId)) return;

      const { quickCaptureModule } = ctx.modules;

      await sendProcessingFeedback(ctx);

      // Telegram is a client of the shared capture boundary; parsing, the conservative
      // semantic safeguards and persistence all stay inside it.
      const result = await quickCaptureModule.getQuickCaptureService().capture({
        text,
        userId,
        userName,
        source: 'telegram',
      });

      if (result.transactions.length === 0 && result.debts.length === 0) {
        await ctx.reply(RU.transaction.noTransactions);
        return;
      }

      // One confirmation for all records of the phrase (FT-122)
      await sendRecordMessage(ctx, {
        userId,
        recordIds: result.transactions.map(tx => tx.id),
        guessed: guessedIds(result.transactions),
      });

      // Process each debt
      for (const debt of result.debts) {
        await sendDebtResponse(ctx, debt, false);
      }

      // Transactions are counted against the free limit by CreateTransactionUseCase, once per
      // created transaction; counting here as well doubled the usage.
    } catch (error) {
      logger.error('Text message error', error instanceof Error ? error : new Error(String(error)), {
        userId,
        text: text.substring(0, 50),
      });

      if (error instanceof AppError) {
        await ctx.reply(`❌ ${error.message}`);
      } else {
        await ctx.reply(RU.errors.generic);
      }
    }
  };
}

/**
 * Create voice message handler with userModule for userId resolution
 */
export function createVoiceMessageHandler(userModule?: UserModule, subscriptionModule?: SubscriptionModule) {
  return async function handleVoiceMessage(ctx: BotContext) {
    const telegramId = String(ctx.from?.id ?? 'unknown');
    const userName = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim() || 'User';
    let filePath: string | undefined;

    // Resolve telegramId to UUID if userModule is available
    let userId = telegramId;
    if (userModule) {
      try {
        userId = await resolveUserIdToUUID(telegramId, userModule);
      } catch (error) {
        logger.error('Failed to resolve userId in voice handler', error as Error);
      }
    }

    const voice = ctx.message && 'voice' in ctx.message ? ctx.message.voice : null;
    if (!voice) {
      await ctx.reply(RU.errors.voiceProcessing);
      return;
    }

    try {
      await sendProcessingFeedback(ctx);

      // Get file link from Telegram
      const fileLink = await ctx.telegram.getFileLink(voice.file_id);

      if (!fileLink?.href) {
        await ctx.reply(`🎤 ${RU.errors.voiceProcessing}`);
        return;
      }

      // Download voice file
      filePath = await downloadVoiceFile(fileLink.href, voice.file_id);

      const { voiceModule } = ctx.modules;

      // Process voice input
      const result = await voiceModule.getProcessVoiceInputUseCase().execute({
        filePath,
        userId,
        userName,
        source: 'telegram',
      });

      if (result.transactions.length === 0 && (!result.debts || result.debts.length === 0)) {
        await ctx.reply(`🎤 ${RU.transaction.noTransactions}`);
        return;
      }

      // The same confirmation as for text, with what the bot heard quoted (FT-122)
      await sendRecordMessage(ctx, {
        userId,
        recordIds: result.transactions.map(tx => tx.id),
        guessed: guessedIds(result.transactions.map(toCapturedTransaction)),
        heard: result.text,
      });

      // Process each debt
      if (result.debts && result.debts.length > 0) {
        for (const debt of result.debts) {
          await sendDebtResponse(ctx, debt, true);
        }
      }

      // Increment voice_inputs usage after successful processing (fire and forget).
      // Created transactions are counted by CreateTransactionUseCase.
      incrementUsage(subscriptionModule, userId, 'voice_inputs').catch(() => {});
    } catch (error) {
      logger.error('Voice message error', error instanceof Error ? error : new Error(String(error)), {
        userId,
        fileId: voice.file_id,
      });

      if (error instanceof AppError) {
        await ctx.reply(`🎤❌ ${error.message}`);
      } else {
        await ctx.reply(`🎤 ${RU.errors.voiceProcessing}`);
      }
    } finally {
      // Clean up downloaded file
      if (filePath) {
        await cleanupFile(filePath);
      }
    }
  };
}

/**
 * Handle Quick Add amount input after category selection
 */
async function handleQuickAddAmount(
  ctx: BotContext,
  text: string,
  userId: string,
  userName: string
) {
  const category = ctx.session.pendingAction?.type === 'awaiting_amount'
    ? ctx.session.pendingAction.category
    : null;

  if (!category) {
    ctx.session.pendingAction = undefined;
    return;
  }

  // Parse amount - support formats: "500", "500р", "500 рублей", "1,500"
  const cleanText = text.replace(/[^\d.,]/g, '').replace(',', '.');
  const amount = parseFloat(cleanText);

  if (isNaN(amount) || amount <= 0) {
    await ctx.reply(RU.errors.emptyMessage + '\n\nНапример: <b>500</b> или <b>1500</b>', {
      parse_mode: 'HTML',
    });
    return;
  }

  // Clear pending action
  ctx.session.pendingAction = undefined;

  const { transactionModule } = ctx.modules;

  try {
    // The button's category: a category id, or an old static id from a message sent before FT-099
    const picked = await quickAddCategory(ctx, userId, category);
    const categoryDisplay = picked.name;

    // Create transaction directly without AI parsing
    const transactionData = {
      userId,
      userName,
      amount,
      source: 'telegram' as const,
      category: picked.category,
      categoryId: picked.categoryId,
      type: 'expense' as const,
      description: categoryDisplay,
      date: new Date().toISOString(),
    };

    const createResult = await transactionModule.getCreateTransactionUseCase().execute(transactionData);

    if (!createResult.success) {
      throw createResult.error;
    }

    // The same confirmation as a record written by text (FT-122)
    await sendRecordMessage(ctx, { userId, recordIds: [createResult.data] });

  } catch (error) {
    logger.error('Quick add error', error as Error);
    if (error instanceof AppError) {
      await ctx.reply(`❌ ${error.message}`);
    } else {
      await ctx.reply(RU.errors.generic);
    }
  }
}

/**
 * Send debt response message
 */
async function sendDebtResponse(
  ctx: BotContext,
  debt: DetectedDebt,
  isVoice: boolean
) {
  const isOwedToMe = debt.debtType === 'owed_to_me';
  const icon = isVoice ? '🎤 ' : '';

  let message = `${icon}${RU.debt.created}\n\n`;
  message += `<b>${isOwedToMe ? RU.debt.owedToMe : RU.debt.iOwe}</b>\n`;
  message += `👤 ${isOwedToMe ? RU.debt.personFrom : RU.debt.person}: <b>${debt.personName}</b>\n`;
  message += `💰 ${RU.debt.amount}: <b>${formatAmount(debt.amount)}</b>\n`;

  if (debt.dueDate) {
    const dueDateFormatted = new Date(debt.dueDate).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
    });
    message += `📅 ${RU.debt.dueDate}: <b>${dueDateFormatted}</b>\n`;
  }

  if (debt.linkedTransactionId) {
    message += `\n<i>${RU.debt.withTransaction}</i>`;
  }

  await ctx.reply(message, { parse_mode: 'HTML' });
}
