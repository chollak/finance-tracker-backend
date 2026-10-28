import { addDaysToDateOnly } from '../../../shared/domain/dates/dateOnly';
import { NotificationKind } from './notificationLog';

/**
 * A notice whose request never left the machine (no network after sleep) waits in `notifications_log` as `not_sent`
 * with its attempts, and the next tick tries it again — until its last day on the user's clock; then it is kept as
 * `failed` with the reason (FT-164, decision 2026-10-29). A daily summary missed by midnight is caught up the next
 * morning as «Итоги за вчера», not at night.
 */
export const NOTICE_WINDOW = {
  /** «Итоги за вчера» do not wake anyone: from this time on the user's clock until the day ends. */
  catchUpFrom: '08:00',
  /** A goal reminder that did not leave may come this many days after its first try. */
  goalExtraDays: 1,
  /** What `notifications_log.error` keeps at most. */
  reasonLength: 500,
} as const;

/**
 * The last day (YYYY-MM-DD, the user's clock) a notice first tried on `today` may still go out: a goal the next day
 * too, the rest only that day — the daily summary its own day (the next morning is «Итоги за вчера», a notice of
 * its own), a subscription its reminder day, the audit the 1st.
 */
export function lastDayToSend(kind: NotificationKind, today: string): string {
  return kind === 'goal_near' || kind === 'goal_over' ? addDaysToDateOnly(today, NOTICE_WINDOW.goalExtraDays) : today;
}

/** «Итоги за вчера» may go out at this time (HH:MM). */
export function isCatchUpTime(time: string): boolean {
  return time >= NOTICE_WINDOW.catchUpFrom;
}

function attemptsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} попытка`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} попытки`;
  return `${count} попыток`;
}

/**
 * What a notice closed as failed keeps: «не ушло: нет сети, 12 попыток, последняя ошибка getaddrinfo ENOTFOUND
 * api.telegram.org». None tried — the bot was not running while the notice was due.
 */
export function notSentReason(attempts: number, lastError: string | null): string {
  if (attempts <= 0) return 'не ушло: ни одной попытки — бот не работал';
  const reason = `не ушло: нет сети, ${attemptsWord(attempts)}${lastError ? `, последняя ошибка ${lastError}` : ''}`;
  return reason.slice(0, NOTICE_WINDOW.reasonLength);
}
