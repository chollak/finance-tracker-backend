import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

/**
 * Loads the env file into `process.env` once, when this module is first imported. Imported first by
 * `appConfig.ts` and by the Winston logger (`logging/logger.ts`): the logger is created at import, in src/index.ts
 * before AppConfig, and read LOG_LEVEL and NODE_ENV before the file was loaded (FT-165).
 *
 * Environment policy:
 * - Real secrets/config live in untracked `.env` or `.env.local`.
 * - `.env.local` is preferred for machine-specific local overrides.
 * - `.env` is the default local/docker env file.
 * - Existing process.env values keep highest priority because dotenv does not override by default.
 * - `.env.development` is intentionally not loaded; use `.env.local` instead.
 *
 * It says which file it loaded through the console: the logger does not exist yet.
 */
function loadEnvironment(): void {
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
    } else if (shouldLogEnvLoading) {
      console.log('Environment variables loaded from .env');
    }
  } else if (shouldLogEnvLoading) {
    console.warn('No .env.local or .env file found, using process environment variables');
  }
}

loadEnvironment();
