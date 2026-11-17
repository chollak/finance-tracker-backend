import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * #393: `loadEnvironment.ts` read `.env.local` / `.env` of the folder Jest runs in, so a value in a developer's file
 * (ENABLE_TELEGRAM_POLLING=false failed 22 bot tests) decided the result. `tests/setup/env.ts` now puts an empty
 * module in its place for every test file; `tests/loggerEnvironment.test.ts` takes the real one back to test it.
 */
describe('Jest does not read the env file (#393)', () => {
  const saved = { ...process.env };
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), '393-env-'));
    jest.spyOn(process, 'cwd').mockReturnValue(dir);
    delete process.env.MARKER_393;
    delete process.env.ENABLE_TELEGRAM_POLLING;
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...saved };
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const loadAppConfigAndLogger = (): void => {
    jest.isolateModules(() => {
      require('../src/shared/infrastructure/logging/logger');
      require('../src/shared/infrastructure/config/appConfig');
    });
  };

  it.each(['.env.local', '.env'])('a value in %s does not reach process.env through AppConfig or the logger', (file) => {
    fs.writeFileSync(path.join(dir, file), 'MARKER_393=from-file\nENABLE_TELEGRAM_POLLING=false\nLOG_LEVEL=error\n');

    loadAppConfigAndLogger();

    expect(process.env.MARKER_393).toBeUndefined();
    expect(process.env.ENABLE_TELEGRAM_POLLING).toBeUndefined();
    expect(process.env.LOG_LEVEL).toBeUndefined();
  });

  it('the file is not even looked for', () => {
    const exists = jest.spyOn(fs, 'existsSync');

    loadAppConfigAndLogger();

    const lookedFor = exists.mock.calls.map(([file]) => path.basename(String(file)));
    expect(lookedFor).not.toContain('.env.local');
    expect(lookedFor).not.toContain('.env');
  });
});
