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
import { AuthModule } from '../../../modules/auth/authModule';
import { SUMMARY_TICK_MS } from '../../../modules/notification/application/dailySummaryNotifier';
import { TelegramPaymentService } from '../../../modules/subscription/infrastructure/TelegramPaymentService';
import { BotContext, BotModules, UserSession } from './types';
import { registerCommandHandlers, setCommandMenu } from './handlers/commandHandlers';
import { registerSummaryHandlers, summarySender } from './handlers/summaryHandlers';
import { registerReminderHandlers, reminderSender } from './handlers/reminderHandlers';
import { registerMessageHandlers } from './handlers/messageHandlers';
import { registerCallbackHandlers } from './handlers/callbackHandlers';
import { registerLoginHandlers } from './handlers/loginHandlers';
import { closeAmountQuestionOnCommand, registerRecordHandlers } from './handlers/recordHandlers';
import { registerPaymentHandlers } from './handlers/paymentHandlers';
import { allowedUsersOnly } from './middleware/allowedUsersOnly';
import { createLogger, LogCategory } from '../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TELEGRAM);

export type TelegramBotRuntimeState = 'disabled' | 'starting' | 'running' | 'retrying' | 'failed';

export interface TelegramBotRuntimeStatus {
  state: TelegramBotRuntimeState;
  attempts: number;
  lastError?: string;
  nextRetryAt?: string;
}

const MAX_POLLING_RETRY_ATTEMPTS = AppConfig.TELEGRAM_POLLING_MAX_RETRIES;
const POLLING_RETRY_BASE_DELAY_MS = AppConfig.TELEGRAM_POLLING_RETRY_BASE_MS;
let telegramBotStatus: TelegramBotRuntimeStatus = { state: 'disabled', attempts: 0 };

/** Above this `setTimeout` fires at once (Node's 2^31 − 1 ms). */
const MAX_TIMER_MS = 2_147_483_647;

/** The pause before a launch, doubling; never past a timer's limit, which would make it no pause at all. */
function retryDelay(attempt: number): number {
  return Math.min(POLLING_RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1)), MAX_TIMER_MS);
}

/**
 * A launch that has polled this long without an error counts as started (FT-167): the next failure is the first of a
 * new count, so a 409 days later is retried instead of `failed` at once. Longer than one long poll (50 s) and twice the
 * longest pause between launches, so two processes that keep taking the token from each other still reach `failed`.
 */
export const POLLING_STABLE_MS = Math.max(60_000, retryDelay(MAX_POLLING_RETRY_ATTEMPTS));

export function getTelegramBotStatus(): TelegramBotRuntimeStatus {
  return { ...telegramBotStatus };
}

export interface TelegramBotOptions {
  /**
   * Called once the bot is `failed`: polling failed for good, or the bot could not be set up (FT-154). The process
   * owner decides what that means — in production it exits so systemd restarts it. Without it the app goes on
   * without the bot.
   */
  onPollingFailed?: (status: TelegramBotRuntimeStatus) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPollingConflict(error: unknown): boolean {
  const message = errorMessage(error);
  return message.includes('409') || /conflict/i.test(message);
}

/** True when `promise` settled within `ms`, false when the time ran out first. */
function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), ms);
    timer.unref?.();
    const settled = () => {
      clearTimeout(timer);
      resolve(true);
    };
    promise.then(settled, settled);
  });
}

/** The running bot, for the process shutdown (FT-167). */
export interface TelegramBotHandle {
  /**
   * Stops polling and waits, at most `graceMs`, for the updates being handled; Telegraf then confirms their offset.
   * Resolves either way: an update still running after that is not confirmed, and Telegram sends it again after the
   * restart.
   */
  stop(graceMs: number): Promise<void>;
}

/** No bot: nothing to wait for. */
const NO_BOT: TelegramBotHandle = { stop: async () => undefined };

/** Thrown from Telegraf's onLaunch when the shutdown began while getMe was running: the launch ends there. */
const STOPPING_ERROR = 'Telegram bot is stopping';

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
 * @param notificationModule - Итоги дня at the chosen time, /today and /month (FT-124), the goal, subscription and
 *   audit reminders (FT-133): their schedulers run here, in the bot's process, and only while the bot polls
 * @param authModule - The web login (FT-128): /start login_<token> asks «Подтвердить» or «Это не я»
 * @param options - `onPollingFailed`: what the process does when the bot is down for good (FT-154)
 * @returns The handle the process shutdown stops the bot with (FT-167); a bot that is disabled or failed to set up
 *   gives one that stops at once
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
  notificationModule?: NotificationModule,
  authModule?: AuthModule,
  options: TelegramBotOptions = {}
): TelegramBotHandle {
  const reportFailure = (status: TelegramBotRuntimeStatus) => {
    if (options.onPollingFailed) {
      options.onPollingFailed(status);
      return;
    }
    logger.warn('Application will continue without Telegram bot functionality');
  };

  try {
    // Check if bot token is configured
    if (!AppConfig.TG_BOT_API_KEY) {
      telegramBotStatus = { state: 'disabled', attempts: 0, lastError: 'TG_BOT_API_KEY missing' };
      logger.warn('TG_BOT_API_KEY is not set, Telegram bot disabled');
      return NO_BOT;
    }

    if (!AppConfig.ENABLE_TELEGRAM_POLLING) {
      telegramBotStatus = { state: 'disabled', attempts: 0, lastError: 'ENABLE_TELEGRAM_POLLING=false' };
      logger.warn('ENABLE_TELEGRAM_POLLING=false, Telegram bot polling disabled');
      return NO_BOT;
    }

    if (AppConfig.WEBHOOK_MODE) {
      telegramBotStatus = { state: 'disabled', attempts: 0, lastError: 'WEBHOOK_MODE=true' };
      logger.warn('WEBHOOK_MODE=true, Telegram bot polling disabled');
      return NO_BOT;
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
      authModule,
    };

    // Ensure downloads directory exists
    const downloadsDir = path.resolve(AppConfig.DOWNLOADS_PATH);
    fs.mkdirSync(downloadsDir, { recursive: true });

    // ===== MIDDLEWARE =====

    // Closed access (FT-153): first of all, so someone not in ALLOWED_TELEGRAM_IDS reaches nothing below
    bot.use(allowedUsersOnly(AppConfig.TELEGRAM_ACCESS));

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

    // «Позже» under the audit call, «Отменено» / «Оставить» under a subscription reminder (FT-133)
    registerReminderHandlers(bot);

    // «Подтвердить» / «Это не я» under a web login question (FT-128)
    registerLoginHandlers(bot);

    // Callback handlers: inline keyboard actions
    registerCallbackHandlers(bot);

    // Message handlers: text and voice (LAST - catches remaining messages)
    // Pass subscription module for limit checking
    registerMessageHandlers(bot, subscriptionModule, userModule);

    // ===== LAUNCH BOT =====

    // Итоги дня at the time each user chose (FT-124) and the reminders after the audit (FT-133) run only while this
    // process polls: the schedulers start once Telegram has answered for the bot, look at the clock a minute later — a
    // polling conflict with another instance shows up within that minute — and stop whenever polling fails, for a
    // retry or for good
    const dailySummary = notificationModule?.getDailySummary();
    const reminders = notificationModule?.getReminders();
    const sender = summarySender(bot.telegram);
    const remindersSender = reminderSender(bot.telegram);
    // Set by the shutdown: no relaunch, no polling started by a getMe that answers late (FT-154, FT-167)
    let stopping = false;
    let retryTimer: NodeJS.Timeout | undefined;
    let stableTimer: NodeJS.Timeout | undefined;
    // The current launch: settles once polling has ended — after the updates being handled — or the launch failed
    let polling: Promise<void> | undefined;
    const startNotices = () => {
      dailySummary?.start(sender, { firstTickInMs: SUMMARY_TICK_MS });
      reminders?.start(remindersSender, { firstTickInMs: SUMMARY_TICK_MS });
    };
    const stopNotices = () => {
      dailySummary?.stop();
      reminders?.stop();
    };

    const launchWithRetry = (attempt: number) => {
      telegramBotStatus = { state: 'starting', attempts: attempt };
      logger.info('Starting Telegram bot long polling', { attempt });

      let started = false;
      // Telegraf's onLaunch: getMe answered, polling is about to start
      const onLaunch = () => {
        // A throw here rejects the launch before deleteWebhook and getUpdates: no update is taken during the shutdown
        if (stopping) throw new Error(STOPPING_ERROR);
        startNotices();
        stableTimer = setTimeout(() => { started = true; }, POLLING_STABLE_MS);
        stableTimer.unref?.();
      };

      const launchPromise = bot.launch(onLaunch);
      telegramBotStatus = { state: 'running', attempts: attempt };
      logger.info('Telegram bot long polling launch requested', { attempt });

      polling = launchPromise.catch((error) => {
        const message = errorMessage(error);
        if (stableTimer) clearTimeout(stableTimer);
        // Another instance may be polling this token: it sends the notices, this one does not
        stopNotices();
        if (stopping) return;

        // A launch that polled for a while was a success: this failure starts the count anew (FT-167)
        const failedAttempt = started ? 1 : attempt;
        if (isPollingConflict(error) && failedAttempt < MAX_POLLING_RETRY_ATTEMPTS) {
          const delayMs = retryDelay(failedAttempt);
          const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
          telegramBotStatus = { state: 'retrying', attempts: failedAttempt, lastError: message, nextRetryAt };
          logger.warn('Telegram polling conflict; retrying bot launch', { attempt: failedAttempt, delayMs, nextRetryAt });
          retryTimer = setTimeout(() => launchWithRetry(failedAttempt + 1), delayMs);
          retryTimer.unref?.();
          return;
        }

        telegramBotStatus = { state: 'failed', attempts: failedAttempt, lastError: message };
        logger.error(
          'Telegram bot polling failed permanently',
          error instanceof Error ? error : new Error(String(error)),
          { attempts: failedAttempt }
        );
        reportFailure(getTelegramBotStatus());
      });
    };

    // The command menu, «/» in the input field (FT-124)
    void setCommandMenu(bot.telegram);

    launchWithRetry(1);

    // The process shutdown stops the bot before it closes the database (FT-167). bot.stop() only aborts getUpdates;
    // Telegraf's polling loop then finishes the handlers of its batch and confirms the batch's offset, and the launch
    // promise settles. It throws «Bot is not running!» before polling started (getMe failed or still running): a throw
    // out of the shutdown would skip it (FT-154)
    const stop = async (graceMs: number): Promise<void> => {
      logger.info('Stopping Telegram bot');
      stopping = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (stableTimer) clearTimeout(stableTimer);
      stopNotices();
      try {
        bot.stop('shutdown');
      } catch (error) {
        logger.debug('Telegram bot was not polling', { reason: errorMessage(error) });
      }
      if (!polling) return;
      if (await settlesWithin(polling, graceMs)) {
        logger.info('Telegram bot stopped');
        return;
      }
      // Updates still handled, or a launch still waiting for Telegram (getMe, deleteWebhook)
      logger.warn('Telegram bot did not stop in time; Telegram sends the updates it did not confirm again after the restart', { graceMs });
    };
    return { stop };

  } catch (error) {
    // Don't throw: the process owner decides whether to go on without the bot (FT-154)
    telegramBotStatus = { state: 'failed', attempts: 0, lastError: errorMessage(error) };
    logger.error('Failed to start Telegram bot', error instanceof Error ? error : new Error(String(error)));
    reportFailure(getTelegramBotStatus());
    return NO_BOT;
  }
}
