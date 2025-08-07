import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { AppConfig } from './appConfig';
import { ConfigurationError } from '../shared/errors/AppError';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.warn('Failed to load .env file');
  } else {
    console.log('Environment variables loaded');
  }
} else {
  console.warn('.env file not found, using environment variables');
}

// Export configuration for backward compatibility
export const OPENAI_API_KEY = AppConfig.OPENAI_API_KEY;
export const NOTION_API_KEY = AppConfig.NOTION_API_KEY;
export const NOTION_DATABASE_ID = AppConfig.NOTION_DATABASE_ID;
export const TG_BOT_API_KEY = AppConfig.TG_BOT_API_KEY;
export const WEB_APP_URL = AppConfig.WEB_APP_URL;
export const DOWNLOADS_DIR = path.resolve(AppConfig.DOWNLOADS_PATH);

export function validateEnv(): void {
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
