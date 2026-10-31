import { randomUUID } from 'crypto';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { addDaysToDateOnly, todayDateOnly } from '../../../shared/domain/dates/dateOnly';
import { LocalClock, localClock } from '../domain/dailySummary';
import { NotificationKind, NotificationLogRepository } from '../domain/notificationLog';
import { NoticeNotSentError } from '../domain/noticeNotSent';
import { lastDayToSend } from '../domain/noticeWindow';
import {
  AnsweredSubscription,
  ReminderNotice,
  ReminderSources,
  SubscriptionAnswer,
  auditCallAgainOn,
  auditMonthOf,
  goalAlertLevel,
  isAuditCallDue,
  isAuditDay,
  isGoalAlertTime,
  isSubscriptionReminderTime,
} from '../domain/reminders';
import { SentNotice } from './dailySummaryNotifier';
import { TakenNotice, claimOrTake, closeExpired, isOpen, leaveNotSent, logLateAttempt } from './noticeAttempts';
import { SchedulerOptions, Ticker } from './ticker';

const logger = getLogger(LogCategory.TELEGRAM);

/** A user the reminders may go to, with the settings that say which and when (FT-098, FT-125). */
export interface ReminderRecipient {
  userId: string;
  /** The private chat with the bot has the user's Telegram id. */
  telegramId: string;
  timeZone: string | undefined;
  /** «Звать на ревизию» and its time, HH:MM. */
  auditEnabled: boolean;
  auditTime: string;
  /** «Цели и подписки». */
  goalAlertsEnabled: boolean;
}

export interface ReminderRecipientSource {
  list(): Promise<ReminderRecipient[]>;
}

/** Draws a reminder and sends it to the user's chat; implemented by the bot (FT-133). */
export interface ReminderSender {
  send(recipient: ReminderRecipient, notice: ReminderNotice): Promise<SentNotice>;
}

/** `retry` — the notice never left the machine: it waits as `not_sent`, the next tick sends it (FT-144, FT-164). */
export type ReminderOutcome = 'sent' | 'skipped' | 'failed' | 'retry';

export interface ReminderTickResult {
  userId: string;
  kind: NotificationKind;
  /** What the notice is about: the goal, the goal and its reminder day, the month audited. */
  period: string;
  outcome: ReminderOutcome;
}

/** «Позже» pressed: the day the call comes again, or `closed` when the audit asked about is not the one held now. */
export type AuditLaterAnswer = { kind: 'later'; dueOn: string } | { kind: 'closed' };

/** A chat the bot can write to: a Telegram user id, not a guest or a dev id. */
const TELEGRAM_CHAT = /^\d+$/;

const settledKey = (userId: string, kind: NotificationKind, period: string) => `${userId}|${kind}|${period}`;

/** The kinds of the reminders: their overdue notices are closed here, the summary's by the summary's scheduler. */
const REMINDER_KINDS: readonly NotificationKind[] = ['goal_near', 'goal_over', 'subscription', 'audit', 'audit_again'];

/**
 * The goal, subscription and audit reminders (FT-133), looked at every minute in the bot's process next to the daily
 * summary. Every notice is claimed in `notifications_log` (user, kind, period) before it is sent, so a second tick, a
 * restart or a second process never sends it twice — at most once: a send that failed is not repeated. Only a send that
 * never left the machine (no network after sleep) waits as `not_sent` with its attempts and is tried every minute while
 * it is due — a goal until the day after its first try ends, the rest until that day ends — after a restart too; then it
 * is kept failed with the reason (FT-144, FT-164, decision 2026-10-29).
 *
 * - **A goal** («Вдвое меньше» only — the others have no limit): once at 80% of its limit since the audit day, once over
 *   it, in the daytime on the user's clock, while it counts; a goal that went straight over gets the second message
 *   only, and the first is kept as skipped so it never comes after.
 * - **A subscription** with «Напомнить»: on its reminder day — the day before the charge — from the morning.
 * - **The audit**: on the 1st at the chosen time while there are spendings to mark; «Позже» brings it back the next day
 *   at the same time, once, without «Позже».
 *
 * A switched-off setting sends nothing and claims nothing: switched on again, what is still due that day goes out. A
 * subscription reminder or an audit call whose day the bot was not running at their time keeps a failed row the next
 * day, «не ушло: ни одной попытки», and is not sent late (FT-173).
 */
export class RemindersNotifier {
  /** Notices settled in this process (sent, skipped, failed, being sent): a tick does not ask the log about them again. */
  private settled = new Set<string>();
  /** The day each user's overdue reminders were closed on in this process: once a day is enough. */
  private closed = new Map<string, string>();
  private ticker = new Ticker('Reminders');

  constructor(
    private log: NotificationLogRepository,
    private recipients: ReminderRecipientSource,
    private sources: ReminderSources,
    private now: () => Date = () => new Date()
  ) {}

  /** Looks at every user's clock once and sends what is due. */
  async tick(sender: ReminderSender): Promise<ReminderTickResult[]> {
    const now = this.now();
    const results: ReminderTickResult[] = [];
    for (const recipient of await this.recipients.list()) {
      if (!TELEGRAM_CHAT.test(recipient.telegramId)) continue;
      const clock = localClock(now, recipient.timeZone);
      try {
        await this.closeOverdue(recipient, clock.date);
        if (recipient.auditEnabled) results.push(...(await this.auditCalls(recipient, clock, sender)));
        if (recipient.goalAlertsEnabled) results.push(...(await this.goalAlerts(recipient, clock, sender)));
      } catch (error) {
        // Nothing was claimed for what failed to be read: the next tick tries again
        logger.error('Reminders failed before they were claimed', error as Error, { userId: recipient.userId, day: clock.date });
      }
    }
    return results;
  }

  /** Ticks now (or `firstTickInMs` later) and then every minute; one tick at a time. */
  start(sender: ReminderSender, options: SchedulerOptions = {}): void {
    this.ticker.start(() => this.tick(sender), options);
  }

  /** No more ticks; a tick already running finishes. `start` again resumes. */
  stop(): void {
    this.ticker.stop();
  }

  /**
   * «Позже» under the audit call of `month`: the call comes again the next day, once. Pressed again, the day stays;
   * under the call of an audit no longer held (a new month has begun) nothing is kept.
   */
  async answerAuditLater(userId: string, month: string): Promise<AuditLaterAnswer> {
    const today = todayDateOnly(this.now());
    if (auditMonthOf(today) !== month) return { kind: 'closed' };
    const entry = await this.log.find(userId, 'audit', month);
    if (!entry) return { kind: 'closed' };
    if (entry.answer === 'later' && entry.dueOn) return { kind: 'later', dueOn: entry.dueOn };
    const dueOn = auditCallAgainOn(today);
    await this.log.update(entry.id, { answer: 'later', dueOn });
    return { kind: 'later', dueOn };
  }

  /** «Отменено» or «Оставить» under a subscription reminder; null when the goal is gone. */
  answerSubscription(userId: string, goalId: string, answer: SubscriptionAnswer): Promise<AnsweredSubscription | null> {
    return this.sources.answerSubscription(userId, goalId, answer, todayDateOnly(this.now()));
  }

  private async auditCalls(recipient: ReminderRecipient, clock: LocalClock, sender: ReminderSender): Promise<ReminderTickResult[]> {
    if (clock.time < recipient.auditTime) return [];
    const month = auditMonthOf(clock.date);
    const results: ReminderTickResult[] = [];

    if (isAuditCallDue(clock, recipient.auditTime) && !(await this.isClaimed(recipient.userId, 'audit', month, clock.date))) {
      const audit = await this.sources.audit(recipient.userId, clock.date);
      const notice: ReminderNotice | null = audit.state === 'open' && audit.left > 0 ? { kind: 'audit', month, left: audit.left, repeat: false } : null;
      results.push(...(await this.once(recipient, 'audit', month, notice, sender, clock.date)));
    }

    // After «Позже»: once, from the day it was put off to
    if (this.settled.has(settledKey(recipient.userId, 'audit_again', month))) return results;
    const call = await this.log.find(recipient.userId, 'audit', month);
    if (call?.answer === 'later' && call.dueOn && call.dueOn <= clock.date && !(await this.isClaimed(recipient.userId, 'audit_again', month, clock.date))) {
      const audit = await this.sources.audit(recipient.userId, clock.date);
      const notice: ReminderNotice | null = audit.state === 'open' && audit.left > 0 ? { kind: 'audit', month, left: audit.left, repeat: true } : null;
      results.push(...(await this.once(recipient, 'audit_again', month, notice, sender, clock.date)));
    }
    return results;
  }

  private async goalAlerts(recipient: ReminderRecipient, clock: LocalClock, sender: ReminderSender): Promise<ReminderTickResult[]> {
    const limitsDue = isGoalAlertTime(clock.time);
    const subscriptionsDue = isSubscriptionReminderTime(clock.time);
    if (!limitsDue && !subscriptionsDue) return [];
    const { limits, subscriptions } = await this.sources.goals(recipient.userId, clock.date);
    const results: ReminderTickResult[] = [];

    if (limitsDue) {
      for (const goal of limits) {
        const level = goalAlertLevel(goal.spentMinor, goal.limitMinor);
        if (level === 'over') {
          if (await this.isClaimed(recipient.userId, 'goal_over', goal.id, clock.date)) continue;
          results.push(...(await this.once(recipient, 'goal_over', goal.id, { kind: 'goal_over', today: clock.date, goal }, sender, clock.date)));
          // The 80% message would come after the excess: it is kept as skipped
          if (!(await this.isClaimed(recipient.userId, 'goal_near', goal.id, clock.date))) await this.once(recipient, 'goal_near', goal.id, null, sender, clock.date);
        } else if (level === 'near' && !(await this.isClaimed(recipient.userId, 'goal_near', goal.id, clock.date))) {
          results.push(...(await this.once(recipient, 'goal_near', goal.id, { kind: 'goal_near', today: clock.date, goal }, sender, clock.date)));
        }
      }
    }

    if (subscriptionsDue) {
      for (const goal of subscriptions) {
        const period = `${goal.id}:${clock.date}`;
        if (await this.isClaimed(recipient.userId, 'subscription', period, clock.date)) continue;
        results.push(...(await this.once(recipient, 'subscription', period, { kind: 'subscription', today: clock.date, goal }, sender, clock.date)));
      }
    }
    return results;
  }

  /**
   * Once a day on the user's clock: yesterday's reminders no tick got to keep a trace (FT-173), and the reminders that
   * did not leave before their last day ended are kept failed with the reason (FT-164).
   */
  private async closeOverdue(recipient: ReminderRecipient, today: string): Promise<void> {
    const { userId } = recipient;
    if (this.closed.get(userId) === today) return;
    const yesterday = addDaysToDateOnly(today, -1);
    try {
      await this.markMissed(recipient, yesterday);
    } catch (error) {
      // Only a trace: today's reminders go out without it
      logger.error('Yesterday\'s missed reminders could not be looked at', error as Error, { userId, day: yesterday });
    }
    await closeExpired(this.log, userId, REMINDER_KINDS, today);
    this.closed.set(userId, today);
  }

  /**
   * The subscription reminders and the audit call of `day` that have no row — the bot was not running at their time —
   * are claimed waiting with `day` as their last day, so `closeExpired` keeps them failed «не ушло: ни одной попытки».
   * Nothing is sent late (decision 2026-10-29) and only the day before is looked at, as for the daily summary. A
   * switched-off setting leaves no trace, nor does an audit with nothing to call to (FT-173).
   */
  private async markMissed(recipient: ReminderRecipient, day: string): Promise<void> {
    const { userId } = recipient;
    const unclaimed = async (kind: NotificationKind, period: string) => !(await this.log.find(userId, kind, period));
    const missed: Array<{ kind: NotificationKind; period: string }> = [];

    if (recipient.goalAlertsEnabled) {
      for (const goal of (await this.sources.goals(userId, day)).subscriptions) {
        const period = `${goal.id}:${day}`;
        if (await unclaimed('subscription', period)) missed.push({ kind: 'subscription', period });
      }
    }
    const month = auditMonthOf(day);
    if (recipient.auditEnabled && isAuditDay(day) && (await unclaimed('audit', month))) {
      const audit = await this.sources.audit(userId, day);
      if (audit.state === 'open' && audit.left > 0) missed.push({ kind: 'audit', period: month });
    }

    for (const { kind, period } of missed) {
      // Claimed twice by two ticks — one row
      await this.log.claim({ id: randomUUID(), userId, kind, period, sendUntil: day, waiting: true });
      logger.warn('Reminder day passed with the bot not running, kept as failed', { userId, kind, period });
    }
  }

  /** In the log and settled; a notice that did not leave and may still go out today is not (FT-164). */
  private async isClaimed(userId: string, kind: NotificationKind, period: string, today: string): Promise<boolean> {
    const key = settledKey(userId, kind, period);
    if (this.settled.has(key)) return true;
    const entry = await this.log.find(userId, kind, period);
    if (!entry) return false;
    if (isOpen(entry, today)) return false;
    this.settled.add(key);
    return true;
  }

  /**
   * Claims the notice, or takes it back if it did not leave earlier, and sends it — or, with nothing to say (`notice`
   * null), keeps it as skipped. Nothing when another tick or process has it.
   */
  private async once(
    recipient: ReminderRecipient,
    kind: NotificationKind,
    period: string,
    notice: ReminderNotice | null,
    sender: ReminderSender,
    today: string
  ): Promise<ReminderTickResult[]> {
    const { userId } = recipient;
    const key = settledKey(userId, kind, period);
    const taken = await claimOrTake(this.log, { userId, kind, period, today, sendUntil: lastDayToSend(kind, today) });
    if (!taken) {
      this.settled.add(key);
      return [];
    }
    const outcome = await this.deliver(taken, recipient, kind, period, notice, sender);
    // A notice that never left is not settled: the next tick takes it again (FT-144, FT-164)
    if (outcome !== 'retry') this.settled.add(key);
    return [{ userId, kind, period, outcome }];
  }

  private async deliver(
    taken: TakenNotice,
    recipient: ReminderRecipient,
    kind: NotificationKind,
    period: string,
    notice: ReminderNotice | null,
    sender: ReminderSender
  ): Promise<ReminderOutcome> {
    const { userId } = recipient;
    if (!notice) {
      await this.log.update(taken.id, { status: 'skipped' });
      return 'skipped';
    }
    try {
      const sent = await sender.send(recipient, notice);
      await this.log.update(taken.id, { status: 'sent', chatId: sent.chatId, messageId: sent.messageId });
      logLateAttempt('Reminder', taken.attempt, { userId, kind, period });
      return 'sent';
    } catch (error) {
      if (error instanceof NoticeNotSentError) return this.notSent(taken, userId, kind, period, error);
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Reminder not sent', { userId, kind, period, attempt: taken.attempt, error: message });
      await this.log.update(taken.id, { status: 'failed', error: message.slice(0, 500) }).catch(() => undefined);
      return 'failed';
    }
  }

  /**
   * The notice never left the machine: it waits as `not_sent` and the next tick sends it while it is due, until its last
   * day; then the first tick of the day after keeps it failed with the reason (FT-144, FT-164).
   */
  private async notSent(taken: TakenNotice, userId: string, kind: NotificationKind, period: string, error: NoticeNotSentError): Promise<ReminderOutcome> {
    // Not kept for another attempt: the row stays `sending`, at most once, so it is not tried again
    if (!(await leaveNotSent(this.log, taken.id, error.reason))) return 'failed';
    logger.warn('Reminder did not leave, trying again next minute', { userId, kind, period, attempt: taken.attempt, error: error.reason });
    return 'retry';
  }
}
