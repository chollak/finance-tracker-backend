import { isValidDateOnly, todayDateOnly } from '../../../shared/domain/dates/dateOnly';

/**
 * How far the time of input may be from the server's clock (FT-175, docs/QUICK_CAPTURE_API.md «Time of input»).
 * Outside the limits it is not the time a phrase was typed — a wrong phone clock or a stuck record — so the capture
 * is refused rather than dated by a guess.
 */
export const CAPTURED_AT_LIMITS = {
  /** Ahead of the server: the phone's and the PC's clocks drift apart a little. */
  aheadMs: 5 * 60 * 1000,
  /** Behind the server: longer than the queue waits while the PC is off. */
  ageMs: 30 * 24 * 60 * 60 * 1000,
} as const;

// RFC 3339: seconds and a zone are required, a fraction is not
const CAPTURED_AT_FORMAT =
  /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

/** The time of input as the client sends it — `2026-10-27T09:15:00+05:00`, `2026-10-27T04:15:00.250Z`; null otherwise. */
export function parseCapturedAt(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = CAPTURED_AT_FORMAT.exec(value);
  if (!match || !isValidDateOnly(match[1])) return null;
  const moment = new Date(value);
  return Number.isNaN(moment.getTime()) ? null : moment;
}

export type CapturedAtProblem = 'ahead' | 'too_old';

/** Why the time of input cannot be one by the server's clock; null when it can. */
export function capturedAtProblem(capturedAt: Date, now: Date): CapturedAtProblem | null {
  const ahead = capturedAt.getTime() - now.getTime();
  if (ahead > CAPTURED_AT_LIMITS.aheadMs) return 'ahead';
  if (-ahead > CAPTURED_AT_LIMITS.ageMs) return 'too_old';
  return null;
}

/**
 * The day of input on the user's calendar, as every record date is (`toDateOnly` on create; Tashkent for every user
 * now). Not the zone the phone wrote: many clients write UTC, and the bot and the Mini App count «сегодня» the same way.
 */
export function inputDayOf(capturedAt: Date): string {
  return todayDateOnly(capturedAt);
}
