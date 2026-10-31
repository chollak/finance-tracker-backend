import { TelegramAccess, telegramIdOf } from './telegramAccess';

/**
 * A production capture token is at least this long. A random token of 32+ characters is not guessed through the AI
 * rate limit in front of the route (20 requests per 15 minutes per address).
 */
export const MIN_PRODUCTION_SHORTCUT_TOKEN_LENGTH = 32;

/**
 * How the iPhone Shortcut writes through POST /api/quick-capture (FT-075, FT-155): a shared token, SHORTCUT_CAPTURE_TOKEN,
 * bound to one owner, SHORTCUT_CAPTURE_OWNER. The Shortcut cannot produce Telegram initData, so the token stands in for
 * it — and since decision 2026-10-26 it does so on the live instance, with NODE_ENV=production.
 */
export interface ShortcutCaptureAccess {
  /** The token, trimmed; '' when not set. */
  readonly token: string;
  /** The Telegram id every capture by the token is written for, without leading zeros; null when not set or not an id. */
  readonly owner: string | null;
  /**
   * Whether the path is on. In production only with a long token and an owner on the list; outside production with no
   * problems, under the old rules (the header names the owner when none is set, the token is needed from the phone).
   */
  readonly enabled: boolean;
  /** What is wrong with the setting. The start fails on any of them (AppConfig.validate); the path is off meanwhile. */
  readonly problems: readonly string[];
}

interface ShortcutCaptureEnv {
  token?: string;
  owner?: string;
}

interface ShortcutCaptureContext {
  production: boolean;
  access: TelegramAccess;
}

/**
 * The owner's problems, everywhere: a typo or a stranger would make every capture fail. A value that is not an id is
 * never printed — it may be the token put in the wrong variable, and the error goes to the log.
 */
function ownerProblems(rawOwner: string, owner: string | null, access: TelegramAccess): string[] {
  if (!rawOwner) return [];
  if (owner === null) {
    return [
      `SHORTCUT_CAPTURE_OWNER is not one Telegram user id (its value, ${rawOwner.length} characters, is not shown). ` +
      "Set the whole number of the owner's Telegram id",
    ];
  }
  if (!access.allows(owner)) {
    return [`SHORTCUT_CAPTURE_OWNER ${owner} is not in ALLOWED_TELEGRAM_IDS: the Shortcut would write for someone with no access`];
  }
  return [];
}

/** Production's problems: the token is the only proof on the live instance, so it comes long and with its owner. */
function productionProblems(token: string, rawOwner: string): string[] {
  if (!token && !rawOwner) return [];
  const problems: string[] = [];
  if (!token) {
    problems.push('SHORTCUT_CAPTURE_OWNER is set without SHORTCUT_CAPTURE_TOKEN. Set both to turn the Shortcut on, or neither');
  } else if (token.length < MIN_PRODUCTION_SHORTCUT_TOKEN_LENGTH) {
    problems.push(
      `SHORTCUT_CAPTURE_TOKEN is shorter than ${MIN_PRODUCTION_SHORTCUT_TOKEN_LENGTH} characters in production. ` +
      'Make a random one, for example with `openssl rand -hex 32`'
    );
  }
  if (token && !rawOwner) {
    problems.push(
      'SHORTCUT_CAPTURE_TOKEN is set without SHORTCUT_CAPTURE_OWNER: in production the token writes, reads and edits ' +
      'records only for its owner (FT-155, FT-218). ' +
      "Set the owner's Telegram id, or remove the token to turn the Shortcut off"
    );
  }
  return problems;
}

export function shortcutCaptureAccess(env: ShortcutCaptureEnv, context: ShortcutCaptureContext): ShortcutCaptureAccess {
  const token = (env.token ?? '').trim();
  const rawOwner = (env.owner ?? '').trim();
  const owner = rawOwner ? telegramIdOf(rawOwner) : null;
  const problems = [
    ...ownerProblems(rawOwner, owner, context.access),
    ...(context.production ? productionProblems(token, rawOwner) : []),
  ];
  const complete = !context.production || (token !== '' && owner !== null);
  return { token, owner, enabled: problems.length === 0 && complete, problems };
}
