import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env file
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

export class AppConfig {
  // Environment
  static readonly NODE_ENV = process.env.NODE_ENV || 'development';
  static readonly PORT = parseInt(process.env.PORT || '3000', 10);
  
  // API Keys
  static readonly OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
  static readonly TG_BOT_API_KEY = process.env.TG_BOT_API_KEY || '';
  static readonly WEB_APP_URL = process.env.WEB_APP_URL || '';

  // OpenAI Configuration
  static readonly OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo';
  static readonly WHISPER_MODEL = process.env.WHISPER_MODEL || 'whisper-1';
  static readonly DEFAULT_LANGUAGE = process.env.DEFAULT_LANGUAGE || 'ru';
  
  // File Processing
  static readonly DOWNLOADS_PATH = process.env.DOWNLOADS_PATH || './downloads';
  
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