import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { BotContext, ProcessedTransaction, StatsSummary } from '../types';
import { RU } from '../i18n/ru';
import { formatTransactionMessage } from '../formatters';
import {
  transactionConfirmationKeyboard,
  transactionAutoSavedKeyboard
} from '../keyboards';
import { downloadVoiceFile, cleanupFile } from '../utils';
import { AppError } from '../../../../shared/domain/errors/AppError';

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
 * Register message handlers
 */
export function registerMessageHandlers(bot: Telegraf<BotContext>) {
  // Text message handler
  bot.on(message('text'), handleTextMessage);

  // Voice message handler
  bot.on(message('voice'), handleVoiceMessage);
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
    if (!text || text.trim().length === 0) {
      await ctx.reply(RU.errors.emptyMessage);
      return;
    }

    const { voiceModule, transactionModule } = ctx.modules;

    // Process text input
    const result = await voiceModule.getProcessTextInputUseCase().execute(text, userId, userName);

    if (result.transactions.length === 0) {
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

    if (result.transactions.length === 0) {
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
