import { randomUUID } from 'crypto';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { addDaysToDateOnly } from '../../../shared/domain/dates/dateOnly';
import { DAILY_SUMMARY_RULES, DaySummary, LocalClock, isSummaryDue, localClock } from '../domain/dailySummary';
import { DailySummaryVariant, NotificationEntry, NotificationKind, NotificationLogRepository } from '../domain/notificationLog';
import { NoticeNotSentError } from '../domain/noticeNotSent';
import { isCatchUpTime, lastDayToSend } from '../domain/noticeWindow';
import { TakenNotice, claimOrTake, closeExpired, leaveNotSent, logLateAttempt, takeOpen } from './noticeAttempts';
import { SummaryService } from './summaryService';
import { SchedulerOptions, Ticker } from './ticker';

export { SUMMARY_TICK_MS } from './ticker';
export type { SchedulerOptions } from './ticker';

const logger = getLogger(LogCategory.TELEGRAM);

const KIND: NotificationKind = 'daily_summary';
/** «Итоги за вчера» (FT-164). */
const LATE: NotificationKind = 'daily_summary_late';
const KINDS: readonly NotificationKind[] = [KIND, LATE];

/** A user the summary may go to, with the settings that say when (FT-098). */
export interface SummaryRecipient {
  userId: string;
  /** The private chat with the bot has the user's Telegram id. */
  telegramId: string;
  timeZone: string | undefined;
  /** When the user first came to the bot: on that day, after the chosen time, nothing is due yet. */
  joinedAt?: Date;
  dailySummaryEnabled: boolean;
  /** HH:MM */
  dailySummaryTime: string;
}

export interface RecipientSource {
  list(): Promise<SummaryRecipient[]>;
}

/** The message that went out. */
export interface SentNotice {
  chatId: string;
  messageId: number;
}

export interface SummarySendOptions {
  /** «Итоги за вчера»: the summary of a day that did not go out by its midnight, the next morning (FT-164). */
  late?: boolean;
}

/** Draws the summary and sends it to the user's chat; implemented by the bot (FT-124). */
export interface DailySummarySender {
  send(recipient: SummaryRecipient, summary: DaySummary, options?: SummarySendOptions): Promise<SentNotice>;
}

/** `retry` — the summary never left the machine: it waits as `not_sent`, the next tick sends it (FT-144, FT-164). */
export type SummaryOutcome = 'sent' | 'asked' | 'skipped' | 'failed' | 'retry';

/**
 * «Да, не было» pressed: `confirmed` — the day still has no records and the answer is kept with the notice;
 * `recorded` — something was recorded for the day since, nothing is kept and the message shows the day instead.
 */
export type NoSpendingAnswer = { kind: 'confirmed' } | { kind: 'recorded'; summary: DaySummary };

export interface TickResult {
  userId: string;
  day: string;
  outcome: SummaryOutcome;
  /** «Итоги за вчера» (FT-164). */
  late?: true;
}

/** A chat the bot can write to: a Telegram user id, not a guest or a dev id. */
const TELEGRAM_CHAT = /^\d+$/;

/**
 * The daily summary (FT-124): at the chosen time on the user's clock, once a day. The day is claimed in
 * `notifications_log` before anything is read or sent, so a second tick, a restart or a second process never
 * sends it twice — at most once: a send that failed or stopped half-way is not repeated. Only a send that never
 * left the machine (no network after sleep) waits as `not_sent` with its attempts and is tried every minute until the
 * day ends — after a restart too (FT-144, FT-164).
 *
 * A summary that did not go out by midnight — it never left, or the bot was not running all evening — is kept failed
 * with the reason, and «Итоги за вчера» come the next morning from 08:00 until that day ends (FT-164, decision
 * 2026-10-29): only for the day before, not a queue of missed days, and the day's own summary comes as usual.
 *
 * A day with records gets the summary; a day without them gets «Трат правда не было?», but never before the
 * user's first record and not more than DAILY_SUMMARY_RULES.emptyEveningsInARow evenings in a row — after that
 * the bot is silent until something is recorded again. A user who came after the chosen time gets the first
 * summary the next day.
 */
export class DailySummaryNotifier {
  /** The day each user's own summary was handled for in this process: a tick does not ask the log again. */
  private handled = new Map<string, string>();
  /** The day each user's «Итоги за вчера» were handled on in this process. */
  private caughtUp = new Map<string, string>();
  /** The day each user's overdue notices were closed on in this process: once a day is enough. */
  private closed = new Map<string, string>();
  private ticker = new Ticker('Daily summary');

  constructor(
    private log: NotificationLogRepository,
    private recipients: RecipientSource,
    private summaries: SummaryService,
    private now: () => Date = () => new Date()
  ) {}

  /** Looks at every user's clock once and sends what is due. */
  async tick(sender: DailySummarySender): Promise<TickResult[]> {
    const now = this.now();
    const results: TickResult[] = [];
    for (const recipient of await this.recipients.list()) {
      if (!TELEGRAM_CHAT.test(recipient.telegramId)) continue;
      const clock = localClock(now, recipient.timeZone);
      try {
        results.push(...(await this.forRecipient(recipient, clock, sender)));
      } catch (error) {
        // Nothing was claimed for what failed to be read or written: the next tick tries again
        logger.error('Daily summary failed before it was claimed', error as Error, { userId: recipient.userId, day: clock.date });
      }
    }
    return results;
  }

  /** Ticks now (or `firstTickInMs` later) and then every SUMMARY_TICK_MS; one tick at a time. */
  start(sender: DailySummarySender, options: SchedulerOptions = {}): void {
    this.ticker.start(() => this.tick(sender), options);
  }

  /** No more ticks; a tick already running finishes. `start` again resumes. */
  stop(): void {
    this.ticker.stop();
  }

  /**
   * «Да, не было» under the empty-day question. While the day has no records the answer is kept with the notice;
   * a day that has records by now (written after the question) keeps nothing and gets its summary instead.
   */
  async answerNoSpending(userId: string, day: string): Promise<NoSpendingAnswer> {
    if (await this.summaries.hasRecords(userId, day, day)) return { kind: 'recorded', summary: await this.summaries.day(userId, day) };
    const entry = await this.askedAbout(userId, day);
    if (entry && entry.answer !== 'no_spending') await this.log.update(entry.id, { answer: 'no_spending' });
    return { kind: 'confirmed' };
  }

  /** Overdue notices first, then «Итоги за вчера», then the day's own summary. */
  private async forRecipient(recipient: SummaryRecipient, clock: LocalClock, sender: DailySummarySender): Promise<TickResult[]> {
    await this.closeOverdue(recipient, clock.date);
    if (!recipient.dailySummaryEnabled) return [];
    const late = await this.catchUp(recipient, clock, sender);
    const onTime = await this.onTime(recipient, clock, sender);
    return [late, onTime].filter((result): result is TickResult => result !== null);
  }

  private async onTime(recipient: SummaryRecipient, clock: LocalClock, sender: DailySummarySender): Promise<TickResult | null> {
    const { userId } = recipient;
    const joined = recipient.joinedAt ? localClock(recipient.joinedAt, recipient.timeZone) : undefined;
    if (!isSummaryDue(clock, recipient.dailySummaryTime, joined) || this.handled.get(userId) === clock.date) return null;
    const taken = await claimOrTake(this.log, { userId, kind: KIND, period: clock.date, today: clock.date, sendUntil: lastDayToSend(KIND, clock.date) });
    const outcome = taken ? await this.deliver(taken, recipient, clock.date, sender, false) : null;
    if (outcome !== 'retry') this.handled.set(userId, clock.date);
    return outcome ? { userId, day: clock.date, outcome } : null;
  }

  /** «Итоги за вчера» waiting since the night: from 08:00, tried until the day ends (FT-164). */
  private async catchUp(recipient: SummaryRecipient, clock: LocalClock, sender: DailySummarySender): Promise<TickResult | null> {
    const { userId } = recipient;
    if (!isCatchUpTime(clock.time) || this.caughtUp.get(userId) === clock.date) return null;
    const day = addDaysToDateOnly(clock.date, -1);
    const taken = await takeOpen(this.log, await this.log.find(userId, LATE, day), clock.date);
    const outcome = taken ? await this.deliver(taken, recipient, day, sender, true) : null;
    if (outcome !== 'retry') this.caughtUp.set(userId, clock.date);
    return outcome ? { userId, day, outcome, late: true } : null;
  }

  /**
   * Once a day on the user's clock, before anything is sent: yesterday's summary missed by midnight gets «Итоги за
   * вчера» waiting for the morning, and every notice of the summary whose last day passed is kept failed with the
   * reason (FT-164). Switched off, nothing is caught up, but what did not leave is still closed.
   */
  private async closeOverdue(recipient: SummaryRecipient, today: string): Promise<void> {
    const { userId } = recipient;
    if (this.closed.get(userId) === today) return;
    if (recipient.dailySummaryEnabled) await this.markMissed(userId, addDaysToDateOnly(today, -1), today);
    await closeExpired(this.log, userId, KINDS, today);
    this.closed.set(userId, today);
  }

  /**
   * Yesterday's summary did not go out — it never left, or the bot was not running all evening: «Итоги за вчера» are
   * claimed to wait for the morning. Only for a user the bot has handled a summary for before: of a day of a user it
   * knows nothing about (a new one) no trace is left and nothing is caught up. Claimed twice by two ticks — one row.
   */
  private async markMissed(userId: string, day: string, today: string): Promise<void> {
    const onTime = await this.log.find(userId, KIND, day);
    if (onTime && onTime.status !== 'not_sent') return;
    if (!onTime) {
      if (!(await this.log.hasEarlier(userId, KIND, day))) return;
      // No tick that evening: the day keeps a trace with no attempts, closed as failed below
      await this.log.claim({ id: randomUUID(), userId, kind: KIND, period: day, sendUntil: day, waiting: true });
    }
    await this.log.claim({ id: randomUUID(), userId, kind: LATE, period: day, sendUntil: lastDayToSend(LATE, today), waiting: true });
  }

  private async deliver(taken: TakenNotice, recipient: SummaryRecipient, day: string, sender: DailySummarySender, late: boolean): Promise<SummaryOutcome> {
    const { userId } = recipient;
    const name = late ? 'Late daily summary' : 'Daily summary';
    let variant: DailySummaryVariant | null = null;
    try {
      const summary = await this.summaries.day(userId, day);
      variant = summary.recordCount === 0 ? 'empty' : 'summary';
      if (variant === 'empty' && !(await this.mayAskAboutEmptyDay(userId, day))) {
        await this.log.update(taken.id, { status: 'skipped', variant });
        return 'skipped';
      }
      const sent = await sender.send(recipient, summary, { late });
      await this.log.update(taken.id, { status: 'sent', variant, chatId: sent.chatId, messageId: sent.messageId });
      logLateAttempt(name, taken.attempt, { userId, day });
      return variant === 'empty' ? 'asked' : 'sent';
    } catch (error) {
      if (error instanceof NoticeNotSentError) return this.notSent(taken, name, userId, day, error);
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`${name} not sent`, { userId, day, attempt: taken.attempt, error: message });
      await this.log.update(taken.id, { status: 'failed', variant, error: message.slice(0, 500) }).catch(() => undefined);
      return 'failed';
    }
  }

  /** The summary never left the machine: it waits as `not_sent` and the next tick sends it, while its window lasts. */
  private async notSent(taken: TakenNotice, name: string, userId: string, day: string, error: NoticeNotSentError): Promise<SummaryOutcome> {
    // Not kept for another attempt: the row stays `sending`, at most once, so it is not tried again
    if (!(await leaveNotSent(this.log, taken.id, error.reason))) return 'failed';
    logger.warn(`${name} did not leave, trying again next minute`, { userId, day, attempt: taken.attempt, error: error.reason });
    return 'retry';
  }

  /** The empty-day question that went out about the day: in the evening or, caught up, the next morning (FT-164). */
  private async askedAbout(userId: string, day: string): Promise<NotificationEntry | null> {
    const entries = await Promise.all(KINDS.map(kind => this.log.find(userId, kind, day)));
    const asked = entries.filter((entry): entry is NotificationEntry => entry?.variant === 'empty');
    return asked.find(entry => entry.status === 'sent') ?? asked[0] ?? null;
  }

  /**
   * Not before the user's first record: «правда» is for someone who records, a user who has not begun is not
   * asked. Then at most N empty-day questions after the user's last record — in the evening or the next morning:
   * fewer than N asked so far, or a record dated on or after the oldest of the last N questions (so at most N − 1 of
   * them came after it).
   */
  private async mayAskAboutEmptyDay(userId: string, day: string): Promise<boolean> {
    if (!(await this.summaries.recordedBy(userId, day))) return false;
    const limit = DAILY_SUMMARY_RULES.emptyEveningsInARow;
    const asked = await this.log.lastSent(userId, KINDS, 'empty', limit);
    if (asked.length < limit) return true;
    return this.summaries.hasRecords(userId, asked[limit - 1].period, day);
  }
}
