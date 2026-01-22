import 'reflect-metadata'; // Required for TypeORM decorators
import express from 'express';
import path from 'path';
import { buildServer } from './delivery/web/express/expressServer';
import { startTelegramBot } from './delivery/messaging/telegram/telegramBot';
import { createModules } from './appModules';
import { AppConfig } from './shared/infrastructure/config/appConfig';
import { ConfigurationError } from './shared/domain/errors/AppError';
import { initializeDatabase, closeDatabase } from './shared/infrastructure/database/database.config';
import { createLogger, LogCategory } from './shared/infrastructure/logging';
import { registerLoggerFactory } from './shared/application/logging';

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
    
    const { transactionModule, budgetModule, debtModule, voiceModule, openAIUsageModule, userModule, subscriptionModule } = createModules();
    const app = express();

    // Trust first proxy (nginx/docker) - required for correct IP detection in rate limiting
    // See: https://expressjs.com/en/guide/behind-proxies.html
    app.set('trust proxy', 1);

    app.use('/api', buildServer(transactionModule, voiceModule, budgetModule, debtModule, openAIUsageModule, userModule, subscriptionModule));

    const buildPath = path.join(__dirname, '../public/webapp');
    
    // Redirect /webapp/* to root for backward compatibility
    app.get('/webapp/*', (req, res) => {
      const newPath = req.path.replace('/webapp', '') || '/';
      const queryString = req.url.split('?')[1];
      const redirectUrl = queryString ? `${newPath}?${queryString}` : newPath;
      res.redirect(301, redirectUrl);
    });
    
    // Serve the web app on root domain
    app.use('/', express.static(buildPath));

    app.get('*', (_req, res) => {
      res.sendFile(path.join(buildPath, 'index.html'));
    });

    const port = process.env.PORT || 3000;
    
    app.listen(port, () => {
      logger.info('Server started', { port });
      // Start Telegram bot after HTTP server is ready
      startTelegramBot(voiceModule, transactionModule, budgetModule, userModule, subscriptionModule);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await closeDatabase();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await closeDatabase();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Application startup failed', error as Error);
    process.exit(1);
  }
}

// Start the application
startApplication();
