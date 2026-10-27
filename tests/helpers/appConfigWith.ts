type Config = typeof import('../../src/shared/infrastructure/config/appConfig').AppConfig;

/**
 * AppConfig read afresh from the given environment. What it checks is always set, so `.env.local` cannot add to it:
 * dotenv never overrides a variable that is already set, even to an empty string.
 */
export function appConfigWith(env: Record<string, string>): Config {
  const saved = { ...process.env };
  Object.assign(process.env, {
    OPENAI_API_KEY: 'test-key',
    PORT: '3000',
    DATABASE_TYPE: 'sqlite',
    ALLOWED_TELEGRAM_IDS: '',
    SHORTCUT_CAPTURE_TOKEN: '',
    SHORTCUT_CAPTURE_OWNER: '',
    ...env,
  });
  // Outside NODE_ENV=test AppConfig says which env file it loaded
  const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  let config!: Config;
  jest.isolateModules(() => {
    config = require('../../src/shared/infrastructure/config/appConfig').AppConfig;
  });
  log.mockRestore();
  process.env = saved;
  return config;
}
