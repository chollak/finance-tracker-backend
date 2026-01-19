import 'reflect-metadata'; // Required for TypeORM decorators
import express from 'express';
import path from 'path';
import { buildServer } from './delivery/web/express/expressServer';
import { startTelegramBot } from './delivery/messaging/telegram/telegramBot';
import { createModules } from './appModules';
import { AppConfig } from './shared/infrastructure/config/appConfig';
import { ConfigurationError } from './shared/domain/errors/AppError';
import { initializeDatabase, closeDatabase } from './shared/infrastructure/database/database.config';

// Environment validation function
function validateEnv(): void {
  const validation = AppConfig.validate();
  
  if (!validation.isValid) {
    console.error('Configuration validation failed:');
    validation.errors.forEach(error => console.error(`- ${error}`));
    
    throw new ConfigurationError(
      `Missing required configuration: ${validation.errors.join(', ')}`
    );
  }

  console.log('✓ Configuration validated successfully');
}

async function startApplication() {
  try {
    validateEnv();
    
    // Initialize database first
    await initializeDatabase();
    
    const { transactionModule, budgetModule, debtModule, voiceModule, openAIUsageModule, userModule, subscriptionModule } = createModules();
    const app = express();

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
      console.log(`🚀 Server running on port ${port}`);
      // Start Telegram bot after HTTP server is ready
      startTelegramBot(voiceModule, transactionModule, budgetModule, userModule, subscriptionModule);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('🔄 Received SIGTERM, shutting down gracefully...');
      await closeDatabase();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('🔄 Received SIGINT, shutting down gracefully...');
      await closeDatabase();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Application startup failed:', error);
    process.exit(1);
  }
}

// Start the application
startApplication();
