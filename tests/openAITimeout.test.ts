import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * FT-145: an OpenAI request that never answers ends after `OPENAI_TIMEOUT_MS` (a phrase after one retry, a voice at
 * once), not after the SDK's 10 minutes × 3 attempts. The fetch below never answers and fails only when the SDK aborts it.
 */
function hangingFetch() {
  return jest.fn((_url: unknown, init?: { signal?: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const aborted = new Error('The operation was aborted');
        aborted.name = 'AbortError';
        reject(aborted);
      });
    }),
  );
}

/** Both values set here, so a developer's `.env.local` never decides the test. */
function loadService(env: Record<string, string>) {
  const saved = { ...process.env };
  Object.assign(process.env, { OPENAI_MAX_RETRIES: '1', ...env });
  let loaded: typeof import('../src/modules/voiceProcessing/infrastructure/openAITranscriptionService');
  jest.isolateModules(() => {
    loaded = require('../src/modules/voiceProcessing/infrastructure/openAITranscriptionService');
  });
  process.env = saved;
  return loaded!.OpenAITranscriptionService;
}

describe('OpenAI timeout and retries (FT-145)', () => {
  it('gives up on a phrase after the configured timeout and one retry', async () => {
    const OpenAITranscriptionService = loadService({ OPENAI_TIMEOUT_MS: '50' });
    const fetch = hangingFetch();
    const service = new OpenAITranscriptionService('test-api-key', { fetch: fetch as any });

    const started = Date.now();
    const error = await service.analyzeInput('кофе 25к и такси 18к').catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'EXTERNAL_SERVICE_ERROR', context: { originalError: expect.stringMatching(/timed out/i) } });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('gives up on a voice without a retry: the SDK would resend the upload it already read', async () => {
    const OpenAITranscriptionService = loadService({ OPENAI_TIMEOUT_MS: '50' });
    const fetch = hangingFetch();
    const service = new OpenAITranscriptionService('test-api-key', { fetch: fetch as any });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft145-'));
    const voice = path.join(dir, 'voice.ogg');
    fs.writeFileSync(voice, Buffer.from('OggS'));

    try {
      const error = await service.transcribe(voice).catch((caught: unknown) => caught);

      expect(error).toMatchObject({ code: 'EXTERNAL_SERVICE_ERROR', context: { originalError: expect.stringMatching(/timed out/i) } });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    // Empty, not missing: dotenv does not fill a key that is set, so a developer's `.env.local` stays out
    [{ OPENAI_TIMEOUT_MS: '', OPENAI_MAX_RETRIES: '' }, 20_000, 1],
    [{ OPENAI_TIMEOUT_MS: 'abc', OPENAI_MAX_RETRIES: '-1' }, 20_000, 1],
    [{ OPENAI_TIMEOUT_MS: '0', OPENAI_MAX_RETRIES: '1.5' }, 20_000, 1],
    // Above 2^31 − 1 setTimeout fires at once; more than 5 retries is not a setting
    [{ OPENAI_TIMEOUT_MS: '2147483648', OPENAI_MAX_RETRIES: '6' }, 20_000, 1],
    [{ OPENAI_TIMEOUT_MS: '15000', OPENAI_MAX_RETRIES: '0' }, 15_000, 0],
  ])('reads %j as a %i ms timeout and %i retries', (env, timeout, retries) => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    let config: typeof import('../src/shared/infrastructure/config/appConfig').AppConfig;
    jest.isolateModules(() => {
      config = require('../src/shared/infrastructure/config/appConfig').AppConfig;
    });
    process.env = saved;

    expect(config!.OPENAI_TIMEOUT_MS).toBe(timeout);
    expect(config!.OPENAI_MAX_RETRIES).toBe(retries);
  });

  it('retries as many times as OPENAI_MAX_RETRIES says', async () => {
    const OpenAITranscriptionService = loadService({ OPENAI_TIMEOUT_MS: '50', OPENAI_MAX_RETRIES: '0' });
    const fetch = hangingFetch();
    const service = new OpenAITranscriptionService('test-api-key', { fetch: fetch as any });

    await service.analyzeInput('кофе 25к и такси 18к').catch(() => undefined);

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
