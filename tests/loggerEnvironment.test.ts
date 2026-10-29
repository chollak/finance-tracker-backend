import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * FT-165: the Winston logger is created when `logger.ts` is first imported — in src/index.ts that is before
 * `appConfig.ts`, which used to load `.env.local` / `.env`. So LOG_LEVEL and NODE_ENV from the env file never reached
 * the logger. The env file is now loaded by `loadEnvironment.ts`, imported first by both.
 */
describe('the env file is loaded before the logger is created (FT-165)', () => {
  const saved = { ...process.env };
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft165-env-'));
    jest.spyOn(process, 'cwd').mockReturnValue(dir);
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...saved };
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const levelOfFreshLogger = (): string => {
    let level!: string;
    jest.isolateModules(() => {
      level = require('../src/shared/infrastructure/logging/logger').winstonLogger.level;
    });
    return level;
  };

  it('LOG_LEVEL from .env.local reaches a logger imported before AppConfig', () => {
    fs.writeFileSync(path.join(dir, '.env.local'), 'LOG_LEVEL=warn\n');

    expect(levelOfFreshLogger()).toBe('warn');
  });

  it('LOG_LEVEL from .env, when there is no .env.local', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'LOG_LEVEL=error\n');

    expect(levelOfFreshLogger()).toBe('error');
  });

  it('a variable already set in the process still wins over the file', () => {
    process.env.LOG_LEVEL = 'error';
    fs.writeFileSync(path.join(dir, '.env.local'), 'LOG_LEVEL=warn\n');

    expect(levelOfFreshLogger()).toBe('error');
  });

  it('the file is loaded once: the logger and AppConfig together say so once', () => {
    process.env.TEST_LOGS = 'true';
    fs.writeFileSync(path.join(dir, '.env.local'), 'LOG_LEVEL=warn\n');
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    jest.isolateModules(() => {
      require('../src/shared/infrastructure/logging/logger');
      require('../src/shared/infrastructure/config/appConfig');
    });

    expect(log.mock.calls.filter(([line]) => String(line).startsWith('Environment variables loaded'))).toEqual([
      ['Environment variables loaded from .env.local'],
    ]);
  });
});
