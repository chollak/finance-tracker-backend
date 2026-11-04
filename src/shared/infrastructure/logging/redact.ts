/**
 * What the logger hides before a line is written (#269).
 *
 * A field is hidden by its name (`token`, `authorization`, `cookie`…), and any text — the message, the error, its stack
 * and every string of the context, however deep — is cleared of secrets by their look and by their value:
 * - a Telegram bot token `<bot id>:<secret>`, as Telegraf puts it in every link (`…/file/bot<TOKEN>/…`); the bot id stays;
 * - an OpenAI key `sk-…`;
 * - the values of the app's own secrets from the environment, whatever they look like.
 *
 * The journal on the PC is read by sub-chats and pasted into chats and public issues, so a secret in it leaks.
 */

export const REDACTED = '[REDACTED]';

/** A field whose name contains one of these is written as `[REDACTED]`, whatever it holds. */
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'apiKey',
  'api_key',
  'secret',
  'authorization',
  'cookie',
  'initData',
  'hash',
  'OPENAI_API_KEY',
  'TG_BOT_API_KEY',
  'SUPABASE_ANON_KEY',
].map(field => field.toLowerCase());

/** The environment variables whose values are secrets: masked wherever they appear in a line. */
const SECRET_ENV_KEYS = ['TG_BOT_API_KEY', 'OPENAI_API_KEY', 'SHORTCUT_CAPTURE_TOKEN'] as const;

/** A shorter value is not a real secret, and masking it would hide ordinary words and numbers. */
const MIN_SECRET_LENGTH = 8;

/**
 * `<digits>:<secret>` — a bot token is the bot id, a colon and 35 letters, digits, `_` or `-`. No word boundary before
 * the digits: in a link they follow `bot`. Thirty characters and more after the colon: a time or a chat id with a
 * message id never has that many.
 */
const BOT_TOKEN = /(\d{3,}):[A-Za-z0-9_-]{30,}/g;

/** `sk-…`, `sk-proj-…`: an OpenAI key. The boundary keeps «risk-…» out. */
const OPENAI_KEY = /\bsk-[A-Za-z0-9_-]{20,}/g;

function secretValues(): string[] {
  return SECRET_ENV_KEYS.map(key => process.env[key]?.trim() ?? '').filter(value => value.length >= MIN_SECRET_LENGTH);
}

function isSensitiveField(key: string): boolean {
  const name = key.toLowerCase();
  return SENSITIVE_FIELDS.some(field => name.includes(field));
}

/**
 * The text with every secret replaced by `[REDACTED]`; the rest as it was. The patterns go first, so the live bot
 * token reads `bot<id>:[REDACTED]` like any other; the values then catch what has no telling look.
 */
export function redactText(text: string): string {
  const withoutPatterns = text.replace(BOT_TOKEN, `$1:${REDACTED}`).replace(OPENAI_KEY, `sk-${REDACTED}`);
  return secretValues().reduce((current, secret) => current.split(secret).join(REDACTED), withoutPatterns);
}

function redactWithin(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactText(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map(item => redactWithin(item, seen));
  if (value instanceof Error) return redactText(value.message);

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, isSensitiveField(key) ? REDACTED : redactWithin(item, seen)])
  );
}

/**
 * A copy of the value for the log: a field with a sensitive name hidden, every string cleared of secrets, arrays kept
 * arrays, numbers, booleans and dates as they are. An object that holds itself is written `[Circular]` there.
 */
export function redactValue(value: unknown): unknown {
  return redactWithin(value, new WeakSet());
}

/** The context of a line, redacted; nothing stays nothing. */
export function redactContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  return context ? (redactValue(context) as Record<string, unknown>) : undefined;
}
