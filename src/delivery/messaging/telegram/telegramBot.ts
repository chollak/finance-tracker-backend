import { Telegraf, session } from 'telegraf';
import fs from 'fs';
import path from 'path';
import { AppConfig } from '../../../shared/infrastructure/config/appConfig';
import { VoiceProcessingModule } from '../../../modules/voiceProcessing/voiceProcessingModule';
import { QuickCaptureModule } from '../../../modules/quickCapture/quickCaptureModule';
import { TransactionModule } from '../../../modules/transaction/transactionModule';
import { UserModule } from '../../../modules/user/userModule';
import { SubscriptionModule } from '../../../modules/subscription/subscriptionModule';
import { CategoryModule } from '../../../modules/category/categoryModule';
import { AccountModule } from '../../../modules/account/accountModule';
import { BotMessageModule } from '../../../modules/botMessage/botMessageModule';
import { NotificationModule } from '../../../modules/notification/notificationModule';
import { SUMMARY_TICK_MS } from '../../../modules/notification/application/dailySummaryNotifier';
import { TelegramPaymentService } from '../../../modules/subscription/infrastructure/TelegramPaymentService';
import { BotContext, BotModules, UserSession } from './types';
import { registerCommandHandlers, setCommandMenu } from './handlers/commandHandlers';
import { registerSummaryHandlers, summarySender } from './handlers/summaryHandlers';
import { registerMessageHandlers } from './handlers/messageHandlers';
import { registerCallbackHandlers } from './handlers/callbackHandlers';
import { closeAmountQuestionOnCommand, registerRecordHandlers } from './handlers/recordHandlers';
import { registerPaymentHandlers } from './handlers/paymentHandlers';
import { createLogger, LogCategory } from '../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TELEGRAM);

export type TelegramBotRuntimeState = 'disabled' | 'starting' | 'running' | 'retrying' | 'failed';

export interface TelegramBotRuntimeStatus {
  state: TelegramBotRuntimeState;
  attempts: number;
  lastError?: string;
  nextRetryAt?: string;
}

const MAX_POLLING_RETRY_ATTEMPTS = Number(process.env.TELEGRAM_POLLING_MAX_RETRIES || 5);
const POLLING_RETRY_BASE_DELAY_MS = Number(process.env.TELEGRAM_POLLING_RETRY_BASE_MS || 5_000);
let telegramBotStatus: TelegramBotRuntimeStatus = { state: 'disabled', attempts: 0 };

export function getTelegramBotStatus(): TelegramBotRuntimeStatus {
  return { ...telegramBotStatus };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPollingConflict(error: unknown): boolean {
  const message = errorMessage(error);
  return message.includes('409') || /conflict/i.test(message);
}

function retryDelay(attempt: number): number {
  return POLLING_RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1));
}


/**
 * Creates initial session for a user
 */
function createInitialSession(userId: string, userName: string): UserSession {
  return {
    userId,
    userName,
    language: 'ru',
  };
}

/**
 * Starts and configures the Telegram bot
 * @param voiceModule - Voice processing module for text/voice input
 * @param transactionModule - Transaction module for CRUD operations
 * @param userModule - User module for user management
 * @param quickCaptureModule - Shared capture boundary used by the text handler
 * @param subscriptionModule - Subscription module for premium features
 * @param categoryModule - The user's categories for keyboards and labels (FT-100)
 * @param accountModule - The user's accounts for the confirmation and the account picker (FT-122)
 * @param botMessageModule - Which records each confirmation shows, so its buttons survive a restart (FT-122)
 * @param notificationModule - Итоги дня at the chosen time, /today and /month (FT-124): its scheduler runs here,
 *   in the bot's process, and only while the bot polls
 */
export function startTelegramBot(
  voiceModule: VoiceProcessingModule,
  transactionModule: TransactionModule,
  userModule: UserModule,
  quickCaptureModule: QuickCaptureModule,
  subscriptionModule?: SubscriptionModule,
  categoryModule?: CategoryModule,
  accountModule?: AccountModule,
  botMessageModule?: BotMessageModule,
  notificationModule?: NotificationModule
) {
  try {
    // Check if bot token is configured
    if (!AppConfig.TG_BOT_API_KEY) {
      telegramBotStatus = { state: 'disabled', attempts: 0, lastError: 'TG_BOT_API_KEY missing' };
      logger.warn('TG_BOT_API_KEY is not set, Telegram bot disabled');
      return;
    }

    if (!AppConfig.ENABLE_TELEGRAM_POLLING) {
      telegramBotStatus = { state: 'disabled', attempts: 0, lastError: 'ENABLE_TELEGRAM_POLLING=false' };
      logger.warn('ENABLE_TELEGRAM_POLLING=false, Telegram bot polling disabled');
      return;
    }

    if (AppConfig.WEBHOOK_MODE) {
      telegramBotStatus = { state: 'disabled', attempts: 0, lastError: 'WEBHOOK_MODE=true' };
      logger.warn('WEBHOOK_MODE=true, Telegram bot polling disabled');
      return;
    }

    // Create bot instance with custom context
    const bot = new Telegraf<BotContext>(AppConfig.TG_BOT_API_KEY);

    // Prepare modules for context injection
    const modules: BotModules = {
      voiceModule,
      quickCaptureModule,
      transactionModule,
      userModule,
      subscriptionModule,
      categoryModule,
      accountModule,
      botMessageModule,
      notificationModule,
    };

    // Ensure downloads directory exists
    const downloadsDir = path.resolve(AppConfig.DOWNLOADS_PATH);
    fs.mkdirSync(downloadsDir, { recursive: true });

    // ===== MIDDLEWARE =====

    // Inject modules into context
    bot.use((ctx, next) => {
      ctx.modules = modules;
      return next();
    });

    // Session middleware for user state
    bot.use(session({
      defaultSession: () => createInitialSession('unknown', 'Guest'),
    }));

    // Initialize session from Telegram user data
    bot.use((ctx, next) => {
      if (ctx.from) {
        ctx.session.userId = String(ctx.from.id);
        ctx.session.userName = ctx.from.first_name || 'Guest';
      }
      return next();
    });

    // Ensure user exists in database (getOrCreate)
    bot.use(async (ctx, next) => {
      if (ctx.from) {
        try {
          await userModule.getGetOrCreateUserUseCase().execute({
            telegramId: String(ctx.from.id),
            userName: ctx.from.username,
            firstName: ctx.from.first_name,
            lastName: ctx.from.last_name,
            languageCode: ctx.from.language_code,
          });
        } catch (error) {
          logger.error('Failed to getOrCreate user', error as Error);
          // Don't block the request, just log the error
        }
      }
      return next();
    });

    // ===== ERROR HANDLING =====

    bot.catch((err, ctx) => {
      logger.error('Telegram bot error', err instanceof Error ? err : new Error(String(err)), {
        userId: ctx?.from?.id,
        updateType: ctx?.updateType,
      });

      // Try to send error message to user
      if (ctx?.reply) {
        ctx.reply('Произошла ошибка. Попробуйте снова.')
          .catch(replyErr => logger.error('Failed to send error message', replyErr as Error));
      }
    });

    // ===== REGISTER HANDLERS =====
    // IMPORTANT: Order matters! Command handlers must be registered before message handlers
    // because bot.on(message('text')) catches all text including commands

    // One question at a time (FT-122): a command first closes the open «Сумму» question of a record
    bot.use(closeAmountQuestionOnCommand);

    // Command handlers: /start, /help, /today, /month (FT-124)
    registerCommandHandlers(bot);

    // Payment handlers: /premium, pre_checkout_query, successful_payment
    // Must be registered BEFORE message handlers to avoid being caught by text handler
    if (subscriptionModule) {
      const paymentService = new TelegramPaymentService(bot.telegram);
      registerPaymentHandlers(bot, subscriptionModule, paymentService);
      logger.info('Payment handlers registered');
    }

    // Record messages (FT-122): their buttons and /undo
    registerRecordHandlers(bot);

    // «Да, не было» under the evening question (FT-124)
    registerSummaryHandlers(bot);

    // Callback handlers: inline keyboard actions
    registerCallbackHandlers(bot);

    // Message handlers: text and voice (LAST - catches remaining messages)
    // Pass subscription module for limit checking
    registerMessageHandlers(bot, subscriptionModule, userModule);

    // ===== LAUNCH BOT =====

    // Итоги дня at the time each user chose (FT-124) run only while this process polls: the scheduler starts once
    // Telegram has answered for the bot, looks at the clock a minute later — a polling conflict with another
    // instance shows up within that minute — and stops whenever polling fails, for a retry or for good
    const dailySummary = notificationModule?.getDailySummary();
    const sender = summarySender(bot.telegram);
    const startDailySummary = () => dailySummary?.start(sender, { firstTickInMs: SUMMARY_TICK_MS });

    const launchWithRetry = (attempt: number) => {
      telegramBotStatus = { state: 'starting', attempts: attempt };
      logger.info('Starting Telegram bot long polling', { attempt });

      const launchPromise = bot.launch(startDailySummary);
      telegramBotStatus = { state: 'running', attempts: attempt };
      logger.info('Telegram bot long polling launch requested', { attempt });

      launchPromise.catch((error) => {
        const message = errorMessage(error);
        // Another instance may be polling this token: it sends the summaries, this one does not
        dailySummary?.stop();

        if (isPollingConflict(error) && attempt < MAX_POLLING_RETRY_ATTEMPTS) {
          const delayMs = retryDelay(attempt);
          const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
          telegramBotStatus = { state: 'retrying', attempts: attempt, lastError: message, nextRetryAt };
          logger.warn('Telegram polling conflict; retrying bot launch', { attempt, delayMs, nextRetryAt });
          setTimeout(() => launchWithRetry(attempt + 1), delayMs).unref?.();
          return;
        }

        telegramBotStatus = { state: 'failed', attempts: attempt, lastError: message };
        logger.error(
          'Telegram bot polling failed permanently',
          error instanceof Error ? error : new Error(String(error)),
          { attempts: attempt }
        );
        logger.warn('Application will continue without Telegram bot functionality');
      });
    };

    // The command menu, «/» in the input field (FT-124)
    void setCommandMenu(bot.telegram);

    launchWithRetry(1);

    // Graceful shutdown handlers
    process.once('SIGINT', () => {
      logger.info('SIGINT received, stopping bot...');
      dailySummary?.stop();
      bot.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
      logger.info('SIGTERM received, stopping bot...');
      dailySummary?.stop();
      bot.stop('SIGTERM');
    });

  } catch (error) {
    logger.error('Failed to start Telegram bot', error instanceof Error ? error : new Error(String(error)));

    // Don't throw - let the application continue without bot
    logger.warn('Application will continue without Telegram bot functionality');
  }
}
