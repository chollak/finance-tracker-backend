export class AppConfig {
  // Environment
  static readonly NODE_ENV = process.env.NODE_ENV || 'development';
  static readonly PORT = parseInt(process.env.PORT || '3000', 10);
  
  // API Keys
  static readonly OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
  static readonly NOTION_API_KEY = process.env.NOTION_API_KEY || '';
  static readonly NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || '';
  static readonly TG_BOT_API_KEY = process.env.TG_BOT_API_KEY || '';
  static readonly WEB_APP_URL = process.env.WEB_APP_URL || '';

  // OpenAI Configuration
  static readonly OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo';
  static readonly WHISPER_MODEL = process.env.WHISPER_MODEL || 'whisper-1';
  static readonly DEFAULT_LANGUAGE = process.env.DEFAULT_LANGUAGE || 'ru';
  
  // File Processing
  static readonly MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10); // 10MB
  static readonly SUPPORTED_AUDIO_FORMATS = ['.mp3', '.wav', '.ogg', '.m4a'];
  static readonly DOWNLOADS_PATH = process.env.DOWNLOADS_PATH || './downloads';
  static readonly UPLOADS_PATH = process.env.UPLOADS_PATH || './uploads';
  
  // Application Settings
  static readonly DEFAULT_TRANSACTION_LIMIT = 50;
  static readonly SUPPORTED_LANGUAGES = ['ru', 'en'];
  static readonly SUPPORTED_CURRENCIES = ['RUB', 'USD', 'EUR'];
  
  // Validation
  static readonly MIN_AMOUNT = 0.01;
  static readonly MAX_AMOUNT = 1000000000; // 1 billion
  static readonly MAX_DESCRIPTION_LENGTH = 500;
  static readonly MAX_CATEGORY_LENGTH = 50;

  // Helper methods
  static isDevelopment(): boolean {
    return this.NODE_ENV === 'development';
  }

  static isProduction(): boolean {
    return this.NODE_ENV === 'production';
  }

  static isTest(): boolean {
    return this.NODE_ENV === 'test';
  }

  static validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.OPENAI_API_KEY) {
      errors.push('OPENAI_API_KEY is required');
    }

    if (!this.NOTION_API_KEY) {
      errors.push('NOTION_API_KEY is required');
    }

    if (!this.NOTION_DATABASE_ID) {
      errors.push('NOTION_DATABASE_ID is required');
    }

    if (this.isProduction() && !this.TG_BOT_API_KEY) {
      errors.push('TG_BOT_API_KEY is required in production');
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