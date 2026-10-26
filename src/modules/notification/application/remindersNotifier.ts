import { randomUUID } from 'crypto';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { todayDateOnly } from '../../../shared/domain/dates/dateOnly';
import { LocalClock, localClock } from '../domain/dailySummary';
import { NotificationKind, NotificationLogRepository } from '../domain/notificationLog';
import { NoticeNotSentError } from '../domain/noticeNotSent';
import {
  AnsweredSubscription,
  ReminderNotice,
  ReminderSources,
  SubscriptionAnswer,
  auditCallAgainOn,
  auditMonthOf,
  goalAlertLevel,
  isAuditCallDue,
  isGoalAlertTime,
  isSubscriptionReminderTime,
} from '../domain/reminders';
import { SentNotice } from './dailySummaryNotifier';
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

/** `retry` — the notice never left the machine: nothing is kept, the next tick sends it (FT-144). */
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

/**
 * The goal, subscription and audit reminders (FT-133), looked at every minute in the bot's process next to the daily
 * summary. Every notice is claimed in `notifications_log` (user, kind, period) before it is sent, so a second tick, a
 * restart or a second process never sends it twice — at most once: a send that failed is not repeated. Only a send that
 * never left the machine (no network after sleep) gives the claim up and is tried every minute for the rest of that day (FT-144).
 *
 * - **A goal** («Вдвое меньше» only — the others have no limit): once at 80% of its limit since the audit day, once over
 *   it, in the daytime on the user's clock, while it counts; a goal that went straight over gets the second message
 *   only, and the first is kept as skipped so it never comes after.
 * - **A subscription** with «Напомнить»: on its reminder day — the day before the charge — from the morning.
 * - **The audit**: on the 1st at the chosen time while there are spendings to mark; «Позже» brings it back the next day
 *   at the same time, once, without «Позже».
 *
 * A switched-off setting sends nothing and claims nothing: switched on again, what is still due that day goes out.
 */
export class RemindersNotifier {
  /** Notices already claimed in this process: a tick does not ask the log about them again. */
  private settled = new Set<string>();
  /** Notices that did not leave the machine in this process: the day of the first try and how many (FT-144). */
  private attempts = new Map<string, { day: string; count: number }>();
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

    if (isAuditCallDue(clock, recipient.auditTime) && !(await this.isClaimed(recipient.userId, 'audit', month))) {
      const audit = await this.sources.audit(recipient.userId, clock.date);
      const notice: ReminderNotice | null = audit.state === 'open' && audit.left > 0 ? { kind: 'audit', month, left: audit.left, repeat: false } : null;
      results.push(...(await this.once(recipient, 'audit', month, notice, sender, clock.date)));
    }

    // After «Позже»: once, from the day it was put off to
    if (this.settled.has(settledKey(recipient.userId, 'audit_again', month))) return results;
    const call = await this.log.find(recipient.userId, 'audit', month);
    if (call?.answer === 'later' && call.dueOn && call.dueOn <= clock.date && !(await this.isClaimed(recipient.userId, 'audit_again', month))) {
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
          if (await this.isClaimed(recipient.userId, 'goal_over', goal.id)) continue;
          results.push(...(await this.once(recipient, 'goal_over', goal.id, { kind: 'goal_over', today: clock.date, goal }, sender, clock.date)));
          // The 80% message would come after the excess: it is kept as skipped
          if (!(await this.isClaimed(recipient.userId, 'goal_near', goal.id))) await this.once(recipient, 'goal_near', goal.id, null, sender, clock.date);
        } else if (level === 'near' && !(await this.isClaimed(recipient.userId, 'goal_near', goal.id))) {
          results.push(...(await this.once(recipient, 'goal_near', goal.id, { kind: 'goal_near', today: clock.date, goal }, sender, clock.date)));
        }
      }
    }

    if (subscriptionsDue) {
      for (const goal of subscriptions) {
        const period = `${goal.id}:${clock.date}`;
        if (await this.isClaimed(recipient.userId, 'subscription', period)) continue;
        results.push(...(await this.once(recipient, 'subscription', period, { kind: 'subscription', today: clock.date, goal }, sender, clock.date)));
      }
    }
    return results;
  }

  private async isClaimed(userId: string, kind: NotificationKind, period: string): Promise<boolean> {
    const key = settledKey(userId, kind, period);
    if (this.settled.has(key)) return true;
    if (!(await this.log.find(userId, kind, period))) return false;
    this.settled.add(key);
    return true;
  }

  /**
   * Claims the notice and sends it — or, with nothing to say (`notice` null), keeps it as skipped. Nothing when another
   * tick or process claimed it first.
   */
  private async once(
    recipient: ReminderRecipient,
    kind: NotificationKind,
    period: string,
    notice: ReminderNotice | null,
    sender: ReminderSender,
    day: string
  ): Promise<ReminderTickResult[]> {
    const { userId } = recipient;
    const key = settledKey(userId, kind, period);
    const id = randomUUID();
    const claimed = await this.log.claim({ id, userId, kind, period });
    if (!claimed) {
      this.settled.add(key);
      return [];
    }
    const outcome = await this.deliver(id, recipient, kind, period, notice, sender, day);
    // A notice that never left is not settled: the next tick claims it again (FT-144)
    if (outcome !== 'retry') this.settled.add(key);
    return [{ userId, kind, period, outcome }];
  }

  private async deliver(
    id: string,
    recipient: ReminderRecipient,
    kind: NotificationKind,
    period: string,
    notice: ReminderNotice | null,
    sender: ReminderSender,
    day: string
  ): Promise<ReminderOutcome> {
    const { userId } = recipient;
    const key = settledKey(userId, kind, period);
    if (!notice) {
      await this.log.update(id, { status: 'skipped' });
      return 'skipped';
    }
    try {
      const sent = await sender.send(recipient, notice);
      this.attempts.delete(key);
      await this.log.update(id, { status: 'sent', chatId: sent.chatId, messageId: sent.messageId });
      return 'sent';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof NoticeNotSentError) return this.notSent(id, key, day, error);
      this.attempts.delete(key);
      logger.warn('Reminder not sent', { userId, kind, period, error: message });
      await this.log.update(id, { status: 'failed', error: message.slice(0, 500) }).catch(() => undefined);
      return 'failed';
    }
  }

  /**
   * The notice never left the machine: the claim is given up and the next tick sends it, for the rest of the user's day
   * it was first tried on. Still not out the next day — kept as failed, not tried again (FT-144).
   */
  private async notSent(id: string, key: string, day: string, error: NoticeNotSentError): Promise<ReminderOutcome> {
    const previous = this.attempts.get(key);
    if (previous && previous.day !== day) {
      this.attempts.delete(key);
      logger.warn('Reminder did not leave all day, not tried again', { key, attempts: previous.count, error: error.reason });
      await this.log.update(id, { status: 'failed', error: error.reason.slice(0, 500) }).catch(() => undefined);
      return 'failed';
    }
    const attempt = (previous?.count ?? 0) + 1;
    this.attempts.set(key, { day, count: attempt });
    try {
      await this.log.release(id);
    } catch (releaseError) {
      // The row stays `sending`: at most once, so the notice is not tried again
      logger.error('Reminder claim not given up, not tried again', releaseError as Error, { key });
      return 'failed';
    }
    logger.warn('Reminder did not leave, trying again next minute', { key, attempt, error: error.reason });
    return 'retry';
  }
}
