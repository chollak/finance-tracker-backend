import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables with priority: .env.local > .env > environment
const loadEnvironment = () => {
  const localEnvPath = path.resolve(process.cwd(), '.env.local');
  const envPath = path.resolve(process.cwd(), '.env');
  
  // First try .env.local for local development
  if (fs.existsSync(localEnvPath)) {
    const result = dotenv.config({ path: localEnvPath });
    if (!result.error) {
      console.log('Environment variables loaded from .env.local (development mode)');
      return;
    }
  }
  
  // Fallback to .env
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      console.warn('Failed to load .env file');
    } else {
      console.log('Environment variables loaded from .env');
    }
  } else {
    console.warn('No .env file found, using environment variables');
  }
};

loadEnvironment();

export class AppConfig {
  // Environment
  static readonly NODE_ENV = process.env.NODE_ENV || 'development';
  static readonly PORT = parseInt(process.env.PORT || '3000', 10);
  static readonly IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
  
  // API Keys
  static readonly OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
  static readonly OPENAI_ORG_ID = process.env.OPENAI_ORG_ID || '';
  static readonly TG_BOT_API_KEY = process.env.TG_BOT_API_KEY || '';
  static readonly WEB_APP_URL = process.env.WEB_APP_URL || '';
  static readonly NGROK_URL = process.env.NGROK_URL || '';

  // Development settings
  static readonly ENABLE_TELEGRAM_POLLING = process.env.ENABLE_TELEGRAM_POLLING === 'true';
  static readonly WEBHOOK_MODE = process.env.WEBHOOK_MODE === 'true';
  
  // OpenAI Configuration
  static readonly OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo';
  static readonly WHISPER_MODEL = process.env.WHISPER_MODEL || 'whisper-1';
  static readonly DEFAULT_LANGUAGE = process.env.DEFAULT_LANGUAGE || 'ru';
  
  // File Processing
  static readonly DOWNLOADS_PATH = process.env.DOWNLOADS_PATH || './downloads';
  
  // Get the appropriate web app URL for current environment
  static getWebAppUrl(): string {
    if (this.IS_DEVELOPMENT && this.NGROK_URL) {
      return this.NGROK_URL;
    }
    return this.WEB_APP_URL;
  }
  
  static validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.OPENAI_API_KEY) {
      errors.push('OPENAI_API_KEY is required');
    }

    if (this.PORT < 1 || this.PORT > 65535) {
      errors.push('PORT must be between 1 and 65535');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}