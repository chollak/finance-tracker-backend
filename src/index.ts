import express from 'express';
import path from 'path';
import { buildServer } from './framework/express/expressServer';
import { startTelegramBot } from './framework/telegram/telegramBot';
import { createModules } from './appModules';
import { AppConfig } from './config/appConfig';
import { ConfigurationError } from './shared/errors/AppError';

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

validateEnv();

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
  console.log(`Server running on port ${port}`);
});
