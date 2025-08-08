import 'reflect-metadata'; // Required for TypeORM decorators
import express from 'express';
import path from 'path';
import { buildServer } from './framework/express/expressServer';
import { startTelegramBot } from './framework/telegram/telegramBot';
import { createModules } from './appModules';
import { AppConfig } from './config/appConfig';
import { ConfigurationError } from './shared/errors/AppError';
import { initializeDatabase, closeDatabase } from './database/database.config';

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
    
    const { transactionModule, voiceModule } = createModules();
    const app = express();

    app.use('/api', buildServer(transactionModule, voiceModule));

    const buildPath = path.join(__dirname, '../public/webapp');
    // Serve the web app under the /webapp path so URLs from the Telegram bot work
    app.use('/webapp', express.static(buildPath));

    app.get('*', (_req, res) => {
      res.sendFile(path.join(buildPath, 'index.html'));
    });

    const port = process.env.PORT || 3000;
    startTelegramBot(voiceModule, transactionModule);

    app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
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
