import { isValidDateOnly, todayDateOnly } from '../../../shared/domain/dates/dateOnly';

/** How far the time of input may be from the server's clock (FT-175, docs/QUICK_CAPTURE_API.md «Time of input»). */
export const CAPTURED_AT_LIMITS = {
  /** Ahead of the server that is taken quietly: the phone's and the PC's clocks drift apart a little. */
  driftMs: 5 * 60 * 1000,
  /**
   * Ahead of the server that is still the phone's time, with a warning: the PC's clock in WSL lags after a sleep —
   * by hours, not by a day. Further ahead the phone's clock is wrong, and the server's clock dates the capture.
   */
  aheadMs: 24 * 60 * 60 * 1000,
  /**
   * Behind the server: longer than the queue waits while the PC is off. Older is a wrong phone clock or a stuck record,
   * so the capture is refused rather than dated by a guess.
   */
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

export type CapturedAtProblem = 'ahead' | 'far_ahead' | 'too_old';

/** What is off about the time of input by the server's clock; null when nothing is. */
export function capturedAtProblem(capturedAt: Date, now: Date): CapturedAtProblem | null {
  const ahead = capturedAt.getTime() - now.getTime();
  if (ahead > CAPTURED_AT_LIMITS.aheadMs) return 'far_ahead';
  if (ahead > CAPTURED_AT_LIMITS.driftMs) return 'ahead';
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

/**
 * The day a capture is dated by: its day of input, or the server's day when the time of input is more than a day ahead
 * — that clock is the wrong one. A time too old is not dated: the caller refuses it (FT-175) or drops it (FT-182).
 */
export function captureDayOf(capturedAt: Date, now: Date): string {
  return inputDayOf(capturedAtProblem(capturedAt, now) === 'far_ahead' ? now : capturedAt);
}
