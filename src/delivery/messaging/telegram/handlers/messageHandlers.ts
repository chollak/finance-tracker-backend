import { Telegraf, Composer } from 'telegraf';
import { message } from 'telegraf/filters';
import { BotContext, ProcessedTransaction, StatsSummary } from '../types';
import { RU, formatAmount } from '../i18n/ru';
import { formatTransactionMessage } from '../formatters';
import {
  transactionConfirmationKeyboard,
  transactionAutoSavedKeyboard,
  getCategoryDisplay
} from '../keyboards';
import { downloadVoiceFile, cleanupFile } from '../utils';
import { AppError } from '../../../../shared/domain/errors/AppError';
import { DetectedDebt } from '../../../../modules/voiceProcessing/domain/processedTransaction';
import { SubscriptionModule } from '../../../../modules/subscription/subscriptionModule';
import { UserModule } from '../../../../modules/user/userModule';
import {
  createTelegramCheckLimitMiddleware,
  createTelegramIncrementUsageMiddleware,
} from '../middleware/subscriptionMiddleware';

const CONFIDENCE_THRESHOLD = 0.6;

// Track last transaction per user for delete functionality
const lastTransactions: Record<string, string> = {};

/**
 * Get last transaction ID for a user
 */
export function getLastTransactionId(userId: string): string | undefined {
  return lastTransactions[userId];
}

/**
 * Set last transaction ID for a user
 */
export function setLastTransactionId(userId: string, transactionId: string): void {
  lastTransactions[userId] = transactionId;
}

/**
 * Clear last transaction ID for a user
 */
export function clearLastTransactionId(userId: string): void {
  delete lastTransactions[userId];
}

/**
 * Register message handlers with subscription limit checks
 */
export function registerMessageHandlers(
  bot: Telegraf<BotContext>,
  subscriptionModule?: SubscriptionModule,
  userModule?: UserModule
) {
  // If subscription module is provided, apply limit checking middleware
  if (subscriptionModule && userModule) {
    const checkTransactionLimit = createTelegramCheckLimitMiddleware(
      subscriptionModule,
      userModule,
      'transactions'
    );
    const incrementTransactionUsage = createTelegramIncrementUsageMiddleware(
      subscriptionModule,
      userModule,
      'transactions'
    );
    const checkVoiceLimit = createTelegramCheckLimitMiddleware(
      subscriptionModule,
      userModule,
      'voice_inputs'
    );
    const incrementVoiceUsage = createTelegramIncrementUsageMiddleware(
      subscriptionModule,
      userModule,
      'voice_inputs'
    );

    // Text message handler with limit check
    // Composer.compose chains middleware: check limit -> handle -> increment usage
    bot.on(
      message('text'),
      checkTransactionLimit,
      handleTextMessage,
      incrementTransactionUsage
    );

    // Voice message handler with limit check
    bot.on(
      message('voice'),
      checkVoiceLimit,
      handleVoiceMessage,
      incrementVoiceUsage
    );
  } else {
    // Fallback without subscription checks
    bot.on(message('text'), handleTextMessage);
    bot.on(message('voice'), handleVoiceMessage);
  }
}

/**
 * Handle text messages - parse and create transactions
 */
async function handleTextMessage(ctx: BotContext) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';

  // Skip commands
  if (text.startsWith('/')) return;

  const userId = String(ctx.from?.id ?? 'unknown');
  const userName = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim() || 'User';

  try {
    // Handle Quick Add - awaiting amount after category selection
    if (ctx.session?.pendingAction?.type === 'awaiting_amount') {
      await handleQuickAddAmount(ctx, text, userId, userName);
      return;
    }

    if (!text || text.trim().length === 0) {
      await ctx.reply(RU.errors.emptyMessage);
      return;
    }

    const { voiceModule, transactionModule } = ctx.modules;

    // Process text input
    const result = await voiceModule.getProcessTextInputUseCase().execute(text, userId, userName);

    if (result.transactions.length === 0 && (!result.debts || result.debts.length === 0)) {
      await ctx.reply(RU.transaction.noTransactions);
      return;
    }

    // Get summary for context
    const summary = await getTodaySummary(transactionModule, userId);

    // Process each transaction
    for (const tx of result.transactions) {
      setLastTransactionId(userId, tx.id);
      await sendTransactionResponse(ctx, tx as ProcessedTransaction, result.text, userId, false, summary);
    }

    // Process each debt
    if (result.debts && result.debts.length > 0) {
      for (const debt of result.debts) {
        await sendDebtResponse(ctx, debt, false);
      }
    }
  } catch (error) {
    console.error('Text message error:', {
      error: error instanceof Error ? error.message : error,
      userId,
      text: text.substring(0, 50),
    });

    if (error instanceof AppError) {
      await ctx.reply(`❌ ${error.message}`);
    } else {
      await ctx.reply(RU.errors.generic);
    }
  }
}

/**
 * Handle voice messages - transcribe and create transactions
 */
async function handleVoiceMessage(ctx: BotContext) {
  const userId = String(ctx.from?.id ?? 'unknown');
  const userName = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim() || 'User';
  let filePath: string | undefined;

  const voice = ctx.message && 'voice' in ctx.message ? ctx.message.voice : null;
  if (!voice) {
    await ctx.reply(RU.errors.voiceProcessing);
    return;
  }

  try {
    // Get file link from Telegram
    const fileLink = await ctx.telegram.getFileLink(voice.file_id);

    if (!fileLink?.href) {
      await ctx.reply(`🎤 ${RU.errors.voiceProcessing}`);
      return;
    }

    // Download voice file
    filePath = await downloadVoiceFile(fileLink.href, voice.file_id);

    const { voiceModule, transactionModule } = ctx.modules;

    // Process voice input
    const result = await voiceModule.getProcessVoiceInputUseCase().execute({
      filePath,
      userId,
      userName,
    });

    if (result.transactions.length === 0 && (!result.debts || result.debts.length === 0)) {
      await ctx.reply(`🎤 ${RU.transaction.noTransactions}`);
      return;
    }

    // Get summary for context
    const summary = await getTodaySummary(transactionModule, userId);

    // Process each transaction
    for (const tx of result.transactions) {
      setLastTransactionId(userId, tx.id);
      await sendTransactionResponse(ctx, tx as ProcessedTransaction, result.text, userId, true, summary);
    }

    // Process each debt
    if (result.debts && result.debts.length > 0) {
      for (const debt of result.debts) {
        await sendDebtResponse(ctx, debt, true);
      }
    }
  } catch (error) {
    console.error('Voice message error:', {
      error: error instanceof Error ? error.message : error,
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
}

/**
 * Send transaction response with appropriate keyboard
 */
async function sendTransactionResponse(
  ctx: BotContext,
  tx: ProcessedTransaction,
  originalText: string,
  userId: string,
  isVoice: boolean,
  summary?: { todayTotal: number; monthTotal: number }
) {
  const confidence = tx.confidence || 0.8;
  const needsConfirmation = confidence < CONFIDENCE_THRESHOLD;

  const message = formatTransactionMessage(
    tx,
    originalText,
    needsConfirmation,
    isVoice,
    summary?.todayTotal,
    summary?.monthTotal
  );

  const keyboard = needsConfirmation
    ? transactionConfirmationKeyboard(tx.id, userId)
    : transactionAutoSavedKeyboard(tx.id, userId);

  await ctx.reply(message, {
    parse_mode: 'HTML',
    ...keyboard,
  });
}

/**
 * Get today's spending summary for context
 */
async function getTodaySummary(
  transactionModule: BotContext['modules']['transactionModule'],
  userId: string
): Promise<{ todayTotal: number; monthTotal: number } | undefined> {
  try {
    const transactions = await transactionModule
      .getGetUserTransactionsUseCase()
      .execute(userId);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let todayTotal = 0;
    let monthTotal = 0;

    for (const tx of transactions) {
      if (tx.type === 'expense') {
        const txDate = new Date(tx.date);
        if (txDate >= startOfMonth) {
          monthTotal += tx.amount;
          if (txDate >= today) {
            todayTotal += tx.amount;
          }
        }
      }
    }

    return { todayTotal, monthTotal };
  } catch {
    return undefined;
  }
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
  const categoryDisplay = getCategoryDisplay(category);

  try {
    // Create transaction directly without AI parsing
    const transactionData = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      userName,
      amount,
      category,
      type: 'expense' as const,
      description: categoryDisplay,
      date: new Date().toISOString(),
    };

    const transactionId = await transactionModule.getCreateTransactionUseCase().execute(transactionData);

    // Track for delete functionality
    setLastTransactionId(userId, transactionId);

    // Get summary for context
    const summary = await getTodaySummary(transactionModule, userId);

    // Create ProcessedTransaction for response
    const processedTx: ProcessedTransaction = {
      id: transactionId,
      amount,
      category,
      type: 'expense',
      description: categoryDisplay,
      confidence: 1.0, // High confidence for manual quick add
    };

    // Send confirmation
    await sendTransactionResponse(
      ctx,
      processedTx,
      `${categoryDisplay} ${amount}`,
      userId,
      false,
      summary
    );
  } catch (error) {
    console.error('Quick add error:', error);
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
