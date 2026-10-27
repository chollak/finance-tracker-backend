/**
 * Closed access (FT-153, decision 2026-10-26 «живой экземпляр на своём ПК»): the bot, the API and the notices are only
 * for the Telegram ids in ALLOWED_TELEGRAM_IDS. An empty list lets everyone in — outside production only: AppConfig
 * refuses to start production without it.
 */
export interface TelegramAccess {
  /** No list: everyone may use this instance. */
  readonly open: boolean;
  allows(telegramId: string | number | null | undefined): boolean;
}

export function telegramAccess(allowedIds: readonly string[]): TelegramAccess {
  const allowed = new Set(allowedIds);
  const open = allowed.size === 0;
  return {
    open,
    allows: telegramId => open || (telegramId !== null && telegramId !== undefined && allowed.has(String(telegramId))),
  };
}

export interface ParsedTelegramIds {
  ids: string[];
  /** Entries that are not a Telegram user id, as written: the start fails on them rather than skipping them. */
  invalid: string[];
}

/**
 * One Telegram user id as the list keeps it: a positive whole number, spaces around it are fine and leading zeros name
 * the same id (`0900000143` → `900000143`). Null for anything else.
 */
export function telegramIdOf(raw: string): string | null {
  const entry = raw.trim();
  const id = /^\d+$/.test(entry) ? Number(entry) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? String(id) : null;
}

/** Telegram user ids separated by commas; spaces around them and empty entries are fine. */
export function parseTelegramIds(raw: string | undefined): ParsedTelegramIds {
  const entries = (raw ?? '').split(',').map(entry => entry.trim()).filter(Boolean);
  const ids: string[] = [];
  const invalid: string[] = [];
  for (const entry of entries) {
    const id = telegramIdOf(entry);
    if (id !== null) ids.push(id);
    else invalid.push(entry);
  }
  return { ids, invalid };
}
