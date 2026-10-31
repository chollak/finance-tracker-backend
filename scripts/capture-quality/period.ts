/**
 * The calendar of the capture quality report (FT-217): days on the Tashkent calendar and runs of days with records.
 *
 * Tashkent is UTC+5 all year — Uzbekistan has had no daylight saving time since 1992 — so a fixed offset is exact, and
 * the SQL side uses the same one: `date(createdAt, '+5 hours')`.
 */

export const TASHKENT_OFFSET_HOURS = 5;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'] as const;

/** YYYY-MM-DD of a moment on the Tashkent calendar. */
export function tashkentDay(moment: Date): string {
  return new Date(moment.getTime() + TASHKENT_OFFSET_HOURS * HOUR_MS).toISOString().slice(0, 10);
}

/** A real calendar day written YYYY-MM-DD: «2026-02-30» is not one. */
export function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** The days from `from` to `to`, both included; none when `to` is earlier. */
export function daysBetween(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const count = Math.max(0, Math.round((end - start) / DAY_MS) + 1);
  return Array.from({ length: count }, (_, index) => new Date(start + index * DAY_MS).toISOString().slice(0, 10));
}

/** Sorted days as ranges of consecutive ones: «2026-10-01 — 2026-10-03», a lone day as it is. */
export function dayRanges(days: readonly string[]): string[] {
  const ranges: string[][] = [];
  for (const day of days) {
    const current = ranges[ranges.length - 1];
    const previous = current?.[current.length - 1];
    if (previous && Date.parse(`${day}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`) === DAY_MS) {
      ranges[ranges.length - 1] = [...current, day];
    } else {
      ranges.push([day]);
    }
  }
  return ranges.map(range => (range.length === 1 ? range[0] : `${range[0]} — ${range[range.length - 1]}`));
}

/** «пн» … «вс». */
export function weekdayOf(day: string): string {
  return WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];
}

export interface Streaks {
  /** The longest run of consecutive days with records. */
  longest: number;
  /** The run that ends on the last day counted. */
  current: number;
  /** The last day is today and has no records yet: it is not over, so it neither ends the run nor counts in it. */
  todayPending: boolean;
}

/**
 * Runs of days with records over `days` (consecutive, in order). Today without records yet is left out of the current
 * run instead of ending it: the report may well be read in the morning.
 */
export function streaksOf(days: readonly string[], recorded: ReadonlySet<string>, today: string): Streaks {
  const last = days[days.length - 1];
  const todayPending = last === today && !recorded.has(today);
  const counted = todayPending ? days.slice(0, -1) : days;

  let longest = 0;
  let run = 0;
  for (const day of counted) {
    run = recorded.has(day) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return { longest, current: run, todayPending };
}
