/** Records are kept in the user's local calendar; every user is in Tashkent for now (users.timezone). */
export const DEFAULT_TIME_ZONE = 'Asia/Tashkent';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A record's `date` as YYYY-MM-DD in the user's time zone. Writers sometimes send a full ISO moment
 * (`new Date().toISOString()` in the bot's quick-add) — stored as is it breaks date-range filters, and
 * its UTC day is yesterday before 05:00 in Tashkent. Unparseable input is returned unchanged for the
 * validator to reject.
 */
export function toDateOnly(value: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  const text = value.trim();
  if (DATE_ONLY.test(text)) return text;
  const moment = new Date(text);
  if (Number.isNaN(moment.getTime())) return value;
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment);
}

/** Today in the user's time zone, as YYYY-MM-DD. */
export function todayDateOnly(now: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): string {
  return toDateOnly(now.toISOString(), timeZone);
}
