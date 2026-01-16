import { Telegraf, session } from 'telegraf';
import fs from 'fs';
import path from 'path';
import { AppConfig } from '../../../shared/infrastructure/config/appConfig';
import { VoiceProcessingModule } from '../../../modules/voiceProcessing/voiceProcessingModule';
import { TransactionModule } from '../../../modules/transaction/transactionModule';
import { BotContext, BotModules, UserSession } from './types';
import { registerCommandHandlers } from './handlers/commandHandlers';
import { registerMessageHandlers } from './handlers/messageHandlers';
import { registerCallbackHandlers } from './handlers/callbackHandlers';

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
 */
export function startTelegramBot(
  voiceModule: VoiceProcessingModule,
  transactionModule: TransactionModule
) {
  try {
    // Check if bot token is configured
    if (!AppConfig.TG_BOT_API_KEY) {
      console.warn('TG_BOT_API_KEY is not set, Telegram bot disabled');
      return;
    }

    // Create bot instance with custom context
    const bot = new Telegraf<BotContext>(AppConfig.TG_BOT_API_KEY);

    // Prepare modules for context injection
    const modules: BotModules = {
      voiceModule,
      transactionModule,
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

    // ===== ERROR HANDLING =====

    bot.catch((err, ctx) => {
      console.error('Telegram bot error:', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        userId: ctx?.from?.id,
        updateType: ctx?.updateType,
      });

      // Try to send error message to user
      if (ctx?.reply) {
        ctx.reply('Произошла ошибка. Попробуйте снова.')
          .catch(replyErr => console.error('Failed to send error message:', replyErr));
      }
    });

    // ===== REGISTER HANDLERS =====

    // Command handlers: /start, /today, /stats, /budget, /help, /settings
    registerCommandHandlers(bot);

    // Message handlers: text and voice
    registerMessageHandlers(bot);

    // Callback handlers: inline keyboard actions
    registerCallbackHandlers(bot);

    // ===== LAUNCH BOT =====

    bot.launch();
    console.log('✅ Telegram бот запущен');

    // Graceful shutdown handlers
    process.once('SIGINT', () => {
      console.log('SIGINT received, stopping bot...');
      bot.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
      console.log('SIGTERM received, stopping bot...');
      bot.stop('SIGTERM');
    });

  } catch (error) {
    console.error('Failed to start Telegram bot:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Don't throw - let the application continue without bot
    console.warn('⚠️ Application will continue without Telegram bot functionality');
  }
}
