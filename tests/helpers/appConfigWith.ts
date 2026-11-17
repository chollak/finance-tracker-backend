type Config = typeof import('../../src/shared/infrastructure/config/appConfig').AppConfig;

/**
 * AppConfig read afresh from the given environment. What it checks is always set, so a variable exported by the shell
 * or CI cannot add to it; the env file is not read in Jest at all (`tests/setup/env.ts`, #393).
 */
export function appConfigWith(env: Record<string, string>): Config {
  const saved = { ...process.env };
  Object.assign(process.env, {
    OPENAI_API_KEY: 'test-key',
    PORT: '3000',
    DATABASE_TYPE: 'sqlite',
    ALLOWED_TELEGRAM_IDS: '',
    ADMIN_TELEGRAM_IDS: '',
    SHORTCUT_CAPTURE_TOKEN: '',
    SHORTCUT_CAPTURE_OWNER: '',
    // Production with polling on needs a token (FT-167)
    TG_BOT_API_KEY: 'test-bot-token',
    ENABLE_TELEGRAM_POLLING: 'true',
    ...env,
  });
  let config!: Config;
  jest.isolateModules(() => {
    config = require('../../src/shared/infrastructure/config/appConfig').AppConfig;
  });
  process.env = saved;
  return config;
}
