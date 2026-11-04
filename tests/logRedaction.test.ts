import { createLogger, winstonLogger } from '../src/shared/infrastructure/logging';
import { redactText, redactValue } from '../src/shared/infrastructure/logging/redact';
import { ExternalServiceError } from '../src/shared/domain/errors/AppError';
import { captureLogLines, LogCapture } from './helpers/logLines';

/**
 * #269: the bot token reached the log inside the voice download link `https://api.telegram.org/file/bot<TOKEN>/…`,
 * because the logger hid fields only by their name. It now masks a Telegram bot token, an OpenAI key and the values of
 * the app's secrets wherever they are: in the message, the error, its stack and any field.
 *
 * Fakes only, put together here, so no scanner takes them for real ones.
 */
const BOT_SECRET = ['ABC-DEF1234ghIkl', 'zyx57W2v1u123ew11'].join('-');
const BOT_TOKEN = `123456:${BOT_SECRET}`;
const FILE_LINK = `https://api.telegram.org/file/bot${BOT_TOKEN}/voice/file_7.oga`;
const OPENAI_KEY = ['sk', 'proj', 'FakeKeyForTests0123456789abcdef'].join('-');
const SHORTCUT_TOKEN = 'shortcut-fake-token-0123456789abcdefABCDEF';

const SECRET_ENV = ['TG_BOT_API_KEY', 'OPENAI_API_KEY', 'SHORTCUT_CAPTURE_TOKEN'] as const;

describe('redactText (#269)', () => {
  const saved = Object.fromEntries(SECRET_ENV.map(key => [key, process.env[key]]));

  afterEach(() => {
    for (const key of SECRET_ENV) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('masks a bot token in a link, keeping the bot id', () => {
    expect(redactText(`GET ${FILE_LINK} failed`)).toBe(
      'GET https://api.telegram.org/file/bot123456:[REDACTED]/voice/file_7.oga failed'
    );
  });

  it('masks a bare bot token and an API method link', () => {
    expect(redactText(`token ${BOT_TOKEN}`)).toBe('token 123456:[REDACTED]');
    expect(redactText(`https://api.telegram.org/bot${BOT_TOKEN}/getFile`)).toBe(
      'https://api.telegram.org/bot123456:[REDACTED]/getFile'
    );
  });

  it('masks an OpenAI key', () => {
    expect(redactText(`401 Incorrect API key provided: ${OPENAI_KEY}.`)).toBe('401 Incorrect API key provided: sk-[REDACTED].');
  });

  it('masks the values of the app secrets, whatever they look like', () => {
    process.env.SHORTCUT_CAPTURE_TOKEN = SHORTCUT_TOKEN;
    process.env.OPENAI_API_KEY = 'plain-openai-value-1234';
    process.env.TG_BOT_API_KEY = 'odd-bot-value-5678';

    expect(redactText(`header ${SHORTCUT_TOKEN}; key plain-openai-value-1234; bot odd-bot-value-5678`)).toBe(
      'header [REDACTED]; key [REDACTED]; bot [REDACTED]'
    );
  });

  it('the live bot token reads like any other: the bot id stays', () => {
    process.env.TG_BOT_API_KEY = BOT_TOKEN;

    expect(redactText(FILE_LINK)).toBe('https://api.telegram.org/file/bot123456:[REDACTED]/voice/file_7.oga');
  });

  it('a short or empty secret value masks nothing: it would hide ordinary words', () => {
    process.env.SHORTCUT_CAPTURE_TOKEN = '1';
    process.env.OPENAI_API_KEY = '';

    expect(redactText('1 record written')).toBe('1 record written');
  });

  it.each([
    '2026-11-04T09:30:00.000Z',
    'at 09:30, 12:00:59',
    '3f1c2b9a-6d1e-4f0a-9b7c-2a1d5e8f0c33',
    'telegramId 131184740 chat 131184740:42',
    'risk-assessment-for-the-quarter-ahead',
    'sqlite:data/database.sqlite',
  ])('leaves ordinary text alone: %s', text => {
    expect(redactText(text)).toBe(text);
  });
});

describe('redactValue (#269)', () => {
  it('masks inside nested objects and arrays, arrays staying arrays', () => {
    expect(redactValue({ request: { href: FILE_LINK }, links: [FILE_LINK, 'plain'] })).toEqual({
      request: { href: 'https://api.telegram.org/file/bot123456:[REDACTED]/voice/file_7.oga' },
      links: ['https://api.telegram.org/file/bot123456:[REDACTED]/voice/file_7.oga', 'plain'],
    });
  });

  it('hides a field by its name, as before, and cookies too', () => {
    expect(redactValue({
      authorization: 'Bearer abc',
      'X-Shortcut-Capture-Token': 'abc',
      cookie: 'daftar_session=abc',
      'set-cookie': ['daftar_session=abc'],
      initData: 'query_id=1',
      count: 2,
    })).toEqual({
      authorization: '[REDACTED]',
      'X-Shortcut-Capture-Token': '[REDACTED]',
      cookie: '[REDACTED]',
      'set-cookie': '[REDACTED]',
      initData: '[REDACTED]',
      count: 2,
    });
  });

  it('keeps numbers, booleans, null and dates as they are', () => {
    const at = new Date('2026-11-04T09:30:00.000Z');

    expect(redactValue({ amount: 5, ok: true, none: null, at })).toEqual({ amount: 5, ok: true, none: null, at });
  });

  it('an object that holds itself does not loop', () => {
    const looped: Record<string, unknown> = { name: 'a' };
    looped.self = looped;

    expect(redactValue(looped)).toEqual({ name: 'a', self: '[Circular]' });
  });
});

describe('the logger masks secrets in every part of a line (#269)', () => {
  let capture: LogCapture;

  beforeEach(() => {
    capture = captureLogLines();
  });

  afterEach(() => {
    capture.restore();
  });

  it('in the message, the fields, the error, its stack and what an AppError keeps', async () => {
    const failure = new Error(`request to ${FILE_LINK} failed, reason: socket hang up`);
    const wrapped = new ExternalServiceError('File Download', failure);

    const logger = createLogger('TEST');
    logger.info(`Downloading ${FILE_LINK}`, { url: FILE_LINK, nested: { links: [FILE_LINK] } });
    logger.warn('Download retried', { reason: failure.message });
    logger.error('Download error', failure, { href: FILE_LINK });
    logger.error('Voice message error', wrapped);

    const lines = await capture.lines();
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      expect(line).not.toContain(BOT_SECRET);
    }
    expect(lines.join('')).toContain('bot123456:[REDACTED]');
  });
});

describe('what reaches Winston is masked already (#269)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('so any format and transport writes it masked', () => {
    const write = jest.spyOn(winstonLogger, 'error').mockImplementation(() => winstonLogger);
    const failure = new Error(`request to ${FILE_LINK} failed`);

    createLogger('TEST').error(`Failed ${FILE_LINK}`, failure, { url: FILE_LINK });

    const [message, meta] = write.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(JSON.stringify([message, meta])).not.toContain(BOT_SECRET);
    expect(meta.error).toBe('request to https://api.telegram.org/file/bot123456:[REDACTED]/voice/file_7.oga failed');
  });
});
