import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { BotContext } from '../types';
import { RU, formatAmount } from '../i18n/ru';
import { downloadVoiceFile, cleanupFile } from '../utils';
import { quickAddCategory } from '../utils/userCategories';
import { assumedThousands, botMessageLog, chatIdOf, guessedIds, sendKeptConfirmation, sendRecordMessage } from '../utils/recordMessageView';
import { messageClientId, withMessageClientId } from '../utils/messageClientId';
import { messageDay } from '../utils/messageTime';
import { answerAmountQuestion } from './recordHandlers';
import { parseAmountReply } from '../utils/amountReply';
import { fromMinor } from '../../../../shared/domain/money/money';
import { AppError, ExternalServiceError } from '../../../../shared/domain/errors/AppError';
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
import { NoSpeechDetectedError } from '../../../../modules/voiceProcessing/domain/voiceErrors';
import { Transaction } from '../../../../modules/transaction/domain/transactionEntity';
import { BotMessage } from '../../../../modules/botMessage/domain/botMessage';
import { HandledMessage } from '../../../../modules/botMessage/domain/handledMessage';
import { todayDateOnly } from '../../../../shared/domain/dates/dateOnly';

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

/** The user behind the update; the Telegram id if it cannot be resolved. */
async function resolveUserId(ctx: BotContext, userModule: UserModule | undefined, where: string): Promise<string> {
  const telegramId = String(ctx.from?.id ?? 'unknown');
  if (!userModule) return telegramId;
  try {
    return await resolveUserIdToUUID(telegramId, userModule);
  } catch (error) {
    logger.error(`Failed to resolve userId in ${where}`, error as Error);
    return telegramId;
  }
}

async function replyWithError(ctx: BotContext, error: unknown): Promise<void> {
  // A failed AI call says so in the user's words; its own message («External service error: OpenAI Chat») is for the log
  if (error instanceof ExternalServiceError) {
    await ctx.reply(RU.errors.aiUnavailable, { parse_mode: 'HTML' });
    return;
  }
  await ctx.reply(error instanceof AppError ? `❌ ${error.message}` : RU.errors.generic);
}

/**
 * Text in a chat where a message waits for an amount (FT-122, FT-123): after «Сумму», «не 25, а 28», a large
 * amount, «Сколько?». It runs ahead of the free limit: an amount there corrects a record already written, so
 * the paywall must not answer it. The answer to «Сколько?» adds a record, so it checks the limit itself
 * (answerMissing). Any other text closes the question and goes on to the capture.
 */
export function createAmountAnswerMiddleware(userModule?: UserModule) {
  return async function answerAmount(ctx: BotContext, next: () => Promise<void>): Promise<void> {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    // Commands, an empty text and the amount of a quick-add category are not answers to «Сумму»
    if (!text.trim() || text.startsWith('/') || ctx.session?.pendingAction?.type === 'awaiting_amount') return next();

    const userId = await resolveUserId(ctx, userModule, 'amount answer');
    let answered: boolean;
    try {
      answered = await answerAmountQuestion(ctx, text, userId);
    } catch (error) {
      logger.error('Amount answer error', error instanceof Error ? error : new Error(String(error)), { userId });
      await replyWithError(ctx, error);
      return;
    }
    if (!answered) return next();
  };
}

/** The chat's recent bot record messages, newest first; none without the log. */
async function recentBotMessages(ctx: BotContext): Promise<BotMessage[]> {
  const log = botMessageLog(ctx);
  const chatId = chatIdOf(ctx);
  return log && chatId ? log.recent(chatId) : [];
}

/** What the bot did with the chat message, as `handled_messages` keeps it; null without the log. */
async function handledMessage(ctx: BotContext, clientId: string): Promise<HandledMessage | null> {
  const log = botMessageLog(ctx);
  return log ? log.handled(clientId) : null;
}

/**
 * A message Telegram sends again (FT-167): the bot stopped before confirming it to Telegram — a restart while it was
 * being handled — and what it did carries the message's client id: the records it wrote, or the row of
 * `handled_messages` — a bot message whose question it answered, the confirmation it was about to send (FT-172).
 * Nothing is written, changed or parsed again (a voice is not even downloaded). The confirmation is sent only if no bot
 * message shows the records yet, for the process may have stopped before sending it — as it was kept, with «Сколько?»,
 * «Расслышал», «?» and «понял как». First in the text and voice chains, ahead of the questions and the free limit.
 */
export function createRepeatedMessageGuard(userModule?: UserModule) {
  return async function skipRepeatedMessage(ctx: BotContext, next: () => Promise<void>): Promise<void> {
    const clientId = messageClientId(ctx);
    if (!clientId) return next();

    const userId = await resolveUserId(ctx, userModule, 'repeated message check');
    let earlier: Transaction[];
    let handled: HandledMessage | null;
    let recent: BotMessage[];
    try {
      [earlier, handled, recent] = await Promise.all([
        ctx.modules.transactionModule.findByClientId(userId, clientId),
        handledMessage(ctx, clientId),
        recentBotMessages(ctx),
      ]);
    } catch (error) {
      logger.error('Failed to look for what a repeated message did', error as Error, { userId });
      return next();
    }

    const kept = handled?.confirmation ?? null;
    if (kept || earlier.length > 0) {
      const recordIds = kept ? kept.recordIds : earlier.map(record => record.id!);
      logger.info('Telegram sent a handled message again; its records are not written twice', { userId, records: recordIds.length });
      const shown = recent.some(message => message.recordIds.some(id => recordIds.includes(id)));
      try {
        if (!shown) await (kept ? sendKeptConfirmation(ctx, userId, kept) : sendRecordMessage(ctx, { userId, recordIds }));
      } catch (error) {
        logger.error('Failed to confirm the records of a repeated message', error as Error, { userId });
      }
      return;
    }

    if (handled) {
      logger.info('Telegram sent a handled message again; it changes nothing more', { userId });
      return;
    }
    return next();
  };
}

/** A command: «/word», maybe addressed to the bot by name («/today@KapelkaBot»), alone or before a space. */
const COMMAND = /^\/[A-Za-z0-9_]+(@\w+)?(\s|$)/;

/**
 * A command no handler took — removed with the design (/budget, /week, /transactions) or never there — gets
 * the board's answer instead of silence (FT-124). Every command handler is registered before the text handlers.
 */
export async function answerUnknownCommand(ctx: BotContext, next: () => Promise<void>): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  if (!COMMAND.test(text)) return next();
  await ctx.reply(RU.commands.unknown);
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
  const skipRepeated = createRepeatedMessageGuard(userModule);
  const answerAmount = createAmountAnswerMiddleware(userModule);
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

    // Text message handler with limit check; a message sent again, an unknown command and the answer to «Сумму» go
    // first
    bot.on(
      message('text'),
      skipRepeated,
      answerUnknownCommand,
      answerAmount,
      checkTransactionLimit,
      textHandler
    );

    // Voice message handler with limit check
    bot.on(
      message('voice'),
      skipRepeated,
      checkVoiceLimit,
      voiceHandler
    );
  } else {
    // Fallback without subscription checks
    bot.on(message('text'), skipRepeated, answerUnknownCommand, answerAmount, textHandler);
    bot.on(message('voice'), skipRepeated, voiceHandler);
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

    const userName = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim() || 'User';
    const userId = await resolveUserId(ctx, userModule, 'text handler');

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

      const { quickCaptureModule } = ctx.modules;

      await sendProcessingFeedback(ctx);

      // Telegram is a client of the shared capture boundary; parsing, the conservative
      // semantic safeguards and persistence all stay inside it.
      // The message's client id: sent again after a restart, it does not write its records twice (FT-167). Its day:
      // read the morning after, an evening's phrase is still the evening's (FT-182)
      const inputDay = messageDay(ctx);
      const result = await quickCaptureModule.getQuickCaptureService().capture({
        text,
        userId,
        userName,
        source: 'telegram',
        ...withMessageClientId(ctx),
        ...(inputDay ? { inputDay } : {}),
      });

      const withoutAmount = result.withoutAmount ?? [];
      if (result.transactions.length === 0 && result.debts.length === 0 && withoutAmount.length === 0) {
        // Nothing to write: say how to write it, with an example (FT-123)
        await ctx.reply(RU.capture.notUnderstood, { parse_mode: 'HTML' });
        return;
      }

      // One confirmation for all records of the phrase (FT-122); what had no amount is asked (FT-123)
      await sendRecordMessage(ctx, {
        userId,
        recordIds: result.transactions.map(tx => tx.id),
        guessed: guessedIds(result.transactions),
        assumed: assumedThousands(result.transactions),
        missing: withoutAmount,
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

      await replyWithError(ctx, error);
    }
  };
}

/**
 * Create voice message handler with userModule for userId resolution
 */
export function createVoiceMessageHandler(userModule?: UserModule, subscriptionModule?: SubscriptionModule) {
  return async function handleVoiceMessage(ctx: BotContext) {
    const userName = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim() || 'User';
    let filePath: string | undefined;
    const userId = await resolveUserId(ctx, userModule, 'voice handler');

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

      // Process voice input. «Сумму» under a record waits for an amount: a voice that is only an amount
      // answers it, any other closes it before its records are written (FT-122, «Один вопрос за раз»).
      // Dated by the day it was sent, as a text (FT-182)
      let answered = false;
      const today = messageDay(ctx);
      const result = await voiceModule.getProcessVoiceInputUseCase().execute(
        { filePath, userId, userName, source: 'telegram', ...withMessageClientId(ctx), ...(today ? { today } : {}) },
        { takeHeardText: async heard => (answered = await answerAmountQuestion(ctx, heard, userId)) }
      );

      if (answered) {
        incrementUsage(subscriptionModule, userId, 'voice_inputs').catch(() => {});
        return;
      }

      const withoutAmount = result.withoutAmount ?? [];
      if (result.transactions.length === 0 && (!result.debts || result.debts.length === 0) && withoutAmount.length === 0) {
        // Heard, but nothing to write («привет»): the answer to a text of the same words, with an example
        // (FT-123, board «Бот · не понял, не расслышал»). «Не расслышал» is for a voice with no words in it
        await ctx.reply(RU.capture.notUnderstood, { parse_mode: 'HTML' });
        return;
      }

      // The same confirmation as for text, with what the bot heard quoted (FT-122)
      const captured = result.transactions.map(toCapturedTransaction);
      await sendRecordMessage(ctx, {
        userId,
        recordIds: result.transactions.map(tx => tx.id),
        guessed: guessedIds(captured),
        assumed: assumedThousands(captured),
        missing: withoutAmount,
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

      if (error instanceof NoSpeechDetectedError) {
        await ctx.reply(RU.capture.notHeard);
      } else if (error instanceof ExternalServiceError) {
        await ctx.reply(RU.errors.aiUnavailable, { parse_mode: 'HTML' });
      } else if (error instanceof AppError) {
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
 * The amount after a quick-add category button of a message sent before FT-124. Read as the answer to «Сколько?»
 * reads it (FT-207): «150,000» and «150к» are 150 000, a bare «500» is 500 000 сум and the confirmation says so,
 * сумы are whole, «$» and «нал» count. It was `parseFloat` with the first comma for a point: «150,000» was 150.
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

  const reply = parseAmountReply(text, { currency: 'UZS' });
  if (!reply) {
    await ctx.reply(RU.errors.emptyMessage + '\n\nНапример: <b>25к</b> или <b>25 000</b>', {
      parse_mode: 'HTML',
    });
    return;
  }
  if (reply.kind === 'not_positive') {
    await ctx.reply(RU.record.amountNotPositive);
    return;
  }
  if (reply.kind === 'too_big') {
    await ctx.reply(RU.record.amountTooBig);
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
      amount: fromMinor(reply.amountMinor),
      amountMinor: reply.amountMinor,
      currency: reply.currency,
      source: 'telegram' as const,
      category: picked.category,
      categoryId: picked.categoryId,
      type: 'expense' as const,
      description: categoryDisplay,
      // The day the amount was sent (FT-182)
      date: messageDay(ctx) ?? todayDateOnly(),
      // Sent again after a restart, when the session that asked for it is gone, the amount writes nothing (FT-167)
      ...withMessageClientId(ctx),
    };

    // As the answer to «Сколько?» is written: «нал» chooses the account, «60$» without a dollar account awaits review
    const createResult = await transactionModule.getCreateTransactionUseCase().execute(transactionData, {
      ...(reply.account ? { accountHint: { kind: reply.account } } : {}),
      allowCurrencyMismatch: true,
    });

    if (!createResult.success) {
      throw createResult.error;
    }

    // The same confirmation as a record written by text (FT-122), with «"500" понял как 500 000 сум»
    const recordId = createResult.data;
    const assumed = reply.written ? { [recordId]: { written: reply.written, amountMinor: reply.amountMinor } } : undefined;
    await sendRecordMessage(ctx, { userId, recordIds: [recordId], assumed });

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
