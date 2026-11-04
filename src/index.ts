import 'reflect-metadata'; // Required for TypeORM decorators
import path from 'path';
import { buildServer } from './delivery/web/express/expressServer';
import { createHttpApp } from './delivery/web/express/httpApp';
import { startTelegramBot, TelegramBotHandle } from './delivery/messaging/telegram/telegramBot';
import { createModules } from './appModules';
import { AppConfig } from './shared/infrastructure/config/appConfig';
import { ConfigurationError } from './shared/domain/errors/AppError';
import { initializeDatabase, closeDatabase } from './shared/infrastructure/database/database.config';
import { createLogger, LogCategory } from './shared/infrastructure/logging';
import { registerLoggerFactory } from './shared/application/logging';
import { BOT_STOP_GRACE_MS, closeHttpServer, createGracefulShutdown } from './delivery/runtime/gracefulShutdown';
import { createBotFailureHandler } from './delivery/runtime/botFailurePolicy';

// Register infrastructure logger for application layer use
// This is the composition root - where we wire up dependencies
registerLoggerFactory(createLogger);

const logger = createLogger(LogCategory.SYSTEM);

// Environment validation function
function validateEnv(): void {
  const validation = AppConfig.validate();
  
  if (!validation.isValid) {
    logger.error('Configuration validation failed', null, { errors: validation.errors });

    throw new ConfigurationError(
      `Missing required configuration: ${validation.errors.join(', ')}`
    );
  }

  logger.info('Configuration validated successfully');
}

async function startApplication() {
  try {
    validateEnv();
    
    // Initialize database first
    await initializeDatabase();
    
    const { categoryModule, accountModule, fxModule, transactionModule, debtModule, voiceModule, quickCaptureModule, userModule, subscriptionModule, botMessageModule, notificationModule, exportModule, authModule, auditModule } = createModules();
    // The API under /api and the web app on the root (#272: no X-Powered-By, no /webapp redirect)
    const app = createHttpApp(
      buildServer(transactionModule, debtModule, userModule, subscriptionModule, quickCaptureModule, { categoryModule, accountModule, fxModule, exportModule, authModule, auditModule }),
      path.join(__dirname, '../public/webapp')
    );

    // The Central Bank USD rate: at start, then until today's rate is in (FT-102)
    fxModule.getService().startDailyRefresh();

    const port = process.env.PORT || 3000;

    // Started once the server listens; a signal before that has no bot to stop
    let telegramBot: TelegramBotHandle | undefined;

    // One way out (FT-154): a signal exits 0; the bot failing for good in production exits 1 so systemd restarts us
    const shutdown = createGracefulShutdown(
      {
        stopSchedulers: () => {
          fxModule.getService().stop();
          notificationModule.getDailySummary().stop();
          notificationModule.getReminders()?.stop();
        },
        // The message being handled finishes before the database closes (FT-167)
        stopBot: () => telegramBot?.stop(BOT_STOP_GRACE_MS) ?? Promise.resolve(),
        closeHttpServer: () => closeHttpServer(server),
        closeDatabase,
      },
      // A macrotask before exiting lets the last log lines reach stdout (journald)
      { exit: code => setImmediate(() => process.exit(code)), logger }
    );
    const onPollingFailed = createBotFailureHandler({ nodeEnv: AppConfig.NODE_ENV, shutdown, logger });

    const server = app.listen(port, () => {
      logger.info('Server started', { port });
      // Start Telegram bot after HTTP server is ready
      telegramBot = startTelegramBot(voiceModule, transactionModule, userModule, quickCaptureModule, subscriptionModule, categoryModule, accountModule, botMessageModule, notificationModule, authModule, { onPollingFailed });
    });

    process.on('SIGTERM', () => void shutdown('SIGTERM', 0));
    process.on('SIGINT', () => void shutdown('SIGINT', 0));

  } catch (error) {
    logger.error('Application startup failed', error as Error);
    process.exit(1);
  }
}

// Start the application
startApplication();
