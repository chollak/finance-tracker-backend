import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { parseTelegramIds, telegramAccess } from '../../domain/access/telegramAccess';
import { shortcutCaptureAccess } from '../../domain/access/shortcutCaptureAccess';

/**
 * Environment policy:
 * - Real secrets/config live in untracked `.env` or `.env.local`.
 * - `.env.local` is preferred for machine-specific local overrides.
 * - `.env` is the default local/docker env file.
 * - Existing process.env values keep highest priority because dotenv does not override by default.
 * - `.env.development` is intentionally not loaded; use `.env.local` instead.
 */
const loadEnvironment = () => {
  const localEnvPath = path.resolve(process.cwd(), '.env.local');
  const envPath = path.resolve(process.cwd(), '.env');
  const shouldLogEnvLoading = process.env.NODE_ENV !== 'test' || process.env.TEST_LOGS === 'true';

  if (fs.existsSync(localEnvPath)) {
    const result = dotenv.config({ path: localEnvPath });
    if (!result.error) {
      if (shouldLogEnvLoading) {
        console.log('Environment variables loaded from .env.local');
      }
      return;
    }
  }

  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      if (shouldLogEnvLoading) {
        console.warn('Failed to load .env file');
      }
    } else {
      if (shouldLogEnvLoading) {
        console.log('Environment variables loaded from .env');
      }
    }
  } else {
    if (shouldLogEnvLoading) {
      console.warn('No .env.local or .env file found, using process environment variables');
    }
  }
};

loadEnvironment();

/** A whole number from the environment, or the fallback when it is missing or not a whole number in [min, max]. */
const intFromEnv = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  return value !== undefined && value.trim() !== '' && Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};
/** Above this `setTimeout` fires at once. */
const MAX_TIMER_MS = 2_147_483_647;
const allowedTelegramIds = parseTelegramIds(process.env.ALLOWED_TELEGRAM_IDS);
// The iPhone Shortcut's token and owner (FT-155). The middleware reads them per request by the same rules; here they
// are only checked, so a wrong setting stops the start instead of turning up later as a 403 on the phone
const shortcutCapture = shortcutCaptureAccess(
  { token: process.env.SHORTCUT_CAPTURE_TOKEN, owner: process.env.SHORTCUT_CAPTURE_OWNER },
  { production: process.env.NODE_ENV === 'production', access: telegramAccess(allowedTelegramIds.ids) }
);

export class AppConfig {
  // Environment
  static readonly NODE_ENV = process.env.NODE_ENV || 'development';
  static readonly PORT = parseInt(process.env.PORT || '3000', 10);
  static readonly IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

  // API Keys
  static readonly OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
  static readonly OPENAI_ORG_ID = process.env.OPENAI_ORG_ID || '';
  static readonly TG_BOT_API_KEY = process.env.TG_BOT_API_KEY || '';
  // The bot's @username for the web login link t.me/<bot>?start=login_… (FT-128); optional — asked from Telegram when empty
  static readonly TG_BOT_USERNAME = process.env.TG_BOT_USERNAME || '';
  static readonly WEB_APP_URL = process.env.WEB_APP_URL || '';
  static readonly NGROK_URL = process.env.NGROK_URL || '';

  // Closed access (FT-153): the bot, the API and the notices only for these Telegram ids, comma-separated.
  // Empty lets everyone in outside production; production does not start without it
  static readonly ALLOWED_TELEGRAM_IDS: readonly string[] = allowedTelegramIds.ids;
  static readonly TELEGRAM_ACCESS = telegramAccess(allowedTelegramIds.ids);

  // Development settings
  // Telegram polling is enabled by default unless explicitly disabled.
  static readonly ENABLE_TELEGRAM_POLLING = process.env.ENABLE_TELEGRAM_POLLING !== 'false';
  // Launches of polling while Telegram answers 409 (another process polls the token), with a doubling delay; after
  // the last one the bot is `failed`, which in production ends the process (FT-154). A typo keeps the default
  static readonly TELEGRAM_POLLING_MAX_RETRIES = intFromEnv(process.env.TELEGRAM_POLLING_MAX_RETRIES, 5, 1, 20);
  static readonly TELEGRAM_POLLING_RETRY_BASE_MS = intFromEnv(process.env.TELEGRAM_POLLING_RETRY_BASE_MS, 5_000, 1, MAX_TIMER_MS);
  static readonly WEBHOOK_MODE = process.env.WEBHOOK_MODE === 'true';

  // OpenAI Configuration
  static readonly OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  static readonly WHISPER_MODEL = process.env.WHISPER_MODEL || 'whisper-1';
  // A request OpenAI does not answer ends here, not after the SDK's 10 minutes × 3 attempts (FT-145).
  // gpt-4.1-mini reads a phrase in 1–3 s and Whisper a short voice in a few seconds, so 20 s is a stuck request
  static readonly OPENAI_TIMEOUT_MS = intFromEnv(process.env.OPENAI_TIMEOUT_MS, 20_000, 1, MAX_TIMER_MS);
  // Text only: a voice upload is not retried (the SDK would resend the stream it already read)
  static readonly OPENAI_MAX_RETRIES = intFromEnv(process.env.OPENAI_MAX_RETRIES, 1, 0, 5);
  static readonly DEFAULT_LANGUAGE = process.env.DEFAULT_LANGUAGE || 'ru';

  // File Processing
  static readonly DOWNLOADS_PATH = process.env.DOWNLOADS_PATH || './downloads';

  // Free-tier limits (50 records and 10 voice inputs a month). Off unless FREE_LIMITS_ENABLED=true:
  // switched off for milestone 10 by decision Д3 (FT-091). Usage is counted either way.
  static readonly FREE_LIMITS_ENABLED = process.env.FREE_LIMITS_ENABLED === 'true';

  // Database Configuration: SQLite through TypeORM is the only path (decision Д6, FT-090).
  static readonly DATABASE_TYPE = process.env.DATABASE_TYPE || 'sqlite';

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

    // A typo skipped quietly would lock the owner out, or leave an empty list that lets everyone in
    if (allowedTelegramIds.invalid.length > 0) {
      errors.push(
        `ALLOWED_TELEGRAM_IDS has entries that are not Telegram user ids: ${allowedTelegramIds.invalid.join(', ')}. ` +
        'List whole numbers separated by commas'
      );
    } else if (this.NODE_ENV === 'production' && this.ALLOWED_TELEGRAM_IDS.length === 0) {
      errors.push(
        'ALLOWED_TELEGRAM_IDS is required in production: without it anyone who finds the bot uses it at the cost of ' +
        'the OpenAI key. List the Telegram user ids allowed in, separated by commas'
      );
    }

    // A Shortcut token that is short or bound to nobody — or to someone without access — is a mistake, not a choice:
    // leaving both unset is how production goes without the Shortcut
    errors.push(...shortcutCapture.problems);

    // Validate database configuration
    if (this.DATABASE_TYPE !== 'sqlite') {
      errors.push(
        `DATABASE_TYPE=${this.DATABASE_TYPE} is not supported: the app uses SQLite through TypeORM only ` +
        '(Supabase repositories were removed in FT-090). Remove DATABASE_TYPE or set it to sqlite'
      );
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
