import type { ILogger } from '../../domain/ports/Logger';

/**
 * Refusals of one Telegram id go to the log at most once per this window (FT-166). Ten minutes: someone who keeps
 * writing to the bot costs six lines an hour instead of one per message, and a flood still shows up within ten
 * minutes of starting. Not a setting: nothing on the live instance needs another value.
 */
export const REFUSAL_LOG_WINDOW_MS = 10 * 60 * 1000;

/**
 * How many refused ids are remembered at once (FT-166). A thousand entries are a few hundred kilobytes; past it the id
 * refused longest ago is forgotten — its skipped refusals are written first — so a stream of different ids cannot grow
 * memory. A personal instance turns away a handful of strangers, so in practice nothing is forgotten.
 */
export const REFUSAL_LOG_MAX_IDS = 1000;

export interface RefusalLogOptions {
  windowMs?: number;
  maxIds?: number;
}

export interface RefusalLog {
  /**
   * One refusal of this Telegram id (null or undefined when the request or update named none). The first of a window
   * is written now with the context; the rest are counted and written as one line with `skipped` when it is over.
   */
  refused(telegramId: string | number | null | undefined, context?: Record<string, unknown>): void;
}

interface Tracked {
  /** As the first refusal named it, for the summary line. */
  readonly telegramId: string | number | null | undefined;
  /** When the current window began. */
  readonly since: number;
  /** Refusals in this window that were not written. */
  readonly skipped: number;
  /** Writes `skipped` when the window is over; set only while something is skipped. */
  readonly summary?: ReturnType<typeof setTimeout>;
}

/** Ids given as a number or a string are one id; refusals that name none are counted together. */
function keyOf(telegramId: string | number | null | undefined): string {
  return telegramId === null || telegramId === undefined ? 'none' : String(telegramId);
}

/**
 * The log of refusals by closed access (FT-153, FT-166): the bot and the API turn away everyone not in
 * ALLOWED_TELEGRAM_IDS, and a line per refusal would let a stranger fill journald on the PC. The first refusal of an
 * id is written at once, so the owner sees who was turned away; its repeats within the window are counted and written
 * as one line — `skipped` and `windowMinutes` — when the window is over. The counts live in memory, for this process.
 */
export function createRefusalLog(logger: ILogger, message: string, options: RefusalLogOptions = {}): RefusalLog {
  const windowMs = options.windowMs ?? REFUSAL_LOG_WINDOW_MS;
  const maxIds = options.maxIds ?? REFUSAL_LOG_MAX_IDS;
  const windowMinutes = windowMs / (60 * 1000);
  // A Map keeps insertion order: an id is moved to the end on every refusal, so the first one is the oldest
  const tracked = new Map<string, Tracked>();

  const writeSkipped = (entry: Tracked): void => {
    if (entry.skipped > 0) {
      logger.warn(`${message} (repeats)`, { telegramId: entry.telegramId, skipped: entry.skipped, windowMinutes });
    }
  };

  /** The window is over: its count goes out and a new one begins, so a flood that goes on stays one line a window. */
  const closeWindow = (key: string): void => {
    const entry = tracked.get(key);
    if (!entry) return;
    writeSkipped(entry);
    tracked.set(key, { telegramId: entry.telegramId, since: Date.now(), skipped: 0 });
  };

  const scheduleSummary = (key: string, delayMs: number): ReturnType<typeof setTimeout> => {
    const timer = setTimeout(() => closeWindow(key), delayMs);
    // A pending summary does not keep the process alive at shutdown
    timer.unref?.();
    return timer;
  };

  const forget = (key: string): void => {
    const entry = tracked.get(key);
    if (!entry) return;
    if (entry.summary) clearTimeout(entry.summary);
    writeSkipped(entry);
    tracked.delete(key);
  };

  /** Room for one more id: the one refused longest ago goes, its count written first. */
  const makeRoom = (): void => {
    const oldest = tracked.keys().next();
    if (tracked.size >= maxIds && !oldest.done) forget(oldest.value);
  };

  return {
    refused(telegramId, context = {}) {
      const key = keyOf(telegramId);
      const now = Date.now();
      const entry = tracked.get(key);

      if (entry && now - entry.since < windowMs) {
        const summary = entry.summary ?? scheduleSummary(key, entry.since + windowMs - now);
        // Moved to the end: the newest
        tracked.delete(key);
        tracked.set(key, { ...entry, skipped: entry.skipped + 1, summary });
        return;
      }

      // A summary late behind a busy event loop still goes out before the new line
      forget(key);
      makeRoom();
      logger.warn(message, { telegramId, ...context });
      tracked.set(key, { telegramId, since: now, skipped: 0 });
    },
  };
}
