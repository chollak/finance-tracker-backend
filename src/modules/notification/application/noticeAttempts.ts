import { randomUUID } from 'crypto';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { NotificationEntry, NotificationKind, NotificationLogRepository } from '../domain/notificationLog';
import { NOTICE_WINDOW, notSentReason } from '../domain/noticeWindow';

const logger = getLogger(LogCategory.TELEGRAM);

/**
 * How a notice is tried and tried again (FT-164), shared by the daily summary and the reminders. At most once stays:
 * only a row `not_sent` is ever taken again, a row `sending` never — the process may have stopped after Telegram got
 * the message.
 */

/** A notice this tick sends: its row and which attempt this is. */
export interface TakenNotice {
  id: string;
  attempt: number;
}

/** Did not leave and may still go out today: its last day has not passed. */
export function isOpen(entry: NotificationEntry, today: string): boolean {
  return entry.status === 'not_sent' && entry.sendUntil !== null && entry.sendUntil >= today;
}

/**
 * Takes back a notice that did not leave earlier, atomically: of two ticks one gets it, and its attempt is counted in
 * the same UPDATE. Null when it is not open.
 */
export async function takeOpen(log: NotificationLogRepository, entry: NotificationEntry | null, today: string): Promise<TakenNotice | null> {
  if (!entry || !isOpen(entry, today)) return null;
  const attempt = await log.retake(entry.id);
  return attempt === null ? null : { id: entry.id, attempt };
}

/**
 * Claims a notice not in the log yet, or takes it back if it did not leave earlier. Null when it is settled (sent,
 * skipped, failed, being sent) or another tick has it.
 */
export async function claimOrTake(
  log: NotificationLogRepository,
  input: { userId: string; kind: NotificationKind; period: string; today: string; sendUntil: string }
): Promise<TakenNotice | null> {
  const entry = await log.find(input.userId, input.kind, input.period);
  if (entry) return takeOpen(log, entry, input.today);
  const id = randomUUID();
  const claimed = await log.claim({ id, userId: input.userId, kind: input.kind, period: input.period, sendUntil: input.sendUntil });
  return claimed ? { id, attempt: 1 } : null;
}

/**
 * The attempt never left the machine: the notice waits as `not_sent` with the error for the next tick. False when that
 * could not be written — the row then stays `sending` and is never tried again (at most once).
 */
export async function leaveNotSent(log: NotificationLogRepository, id: string, error: string): Promise<boolean> {
  try {
    return await log.transition(id, 'sending', { status: 'not_sent', error: error.slice(0, NOTICE_WINDOW.reasonLength) });
  } catch (writeError) {
    logger.error('Notice not kept for another attempt, not tried again', writeError as Error, { id });
    return false;
  }
}

/**
 * The user's notices of these kinds that did not leave before their last day ended: kept `failed` with the reason —
 * «не ушло: нет сети, 12 попыток, последняя ошибка …». Returns the ones this call closed.
 */
export async function closeExpired(
  log: NotificationLogRepository,
  userId: string,
  kinds: readonly NotificationKind[],
  today: string
): Promise<NotificationEntry[]> {
  const closed: NotificationEntry[] = [];
  for (const entry of await log.expired(userId, kinds, today)) {
    const error = notSentReason(entry.attempts, entry.error);
    if (!(await log.transition(entry.id, 'not_sent', { status: 'failed', error }))) continue;
    logger.warn('Notice did not leave before its window ended, kept as failed', {
      userId, kind: entry.kind, period: entry.period, attempts: entry.attempts, error,
    });
    closed.push(entry);
  }
  return closed;
}

/** A notice that went out after attempts that did not: which attempt it was, for the log. */
export function logLateAttempt(name: string, attempt: number, context: Record<string, unknown>): void {
  if (attempt > 1) logger.info(`${name} sent on attempt ${attempt}`, { ...context, attempt });
}
