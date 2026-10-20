import { randomUUID } from 'crypto';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { DAILY_SUMMARY_RULES, DaySummary, isSummaryDue, localClock } from '../domain/dailySummary';
import { DailySummaryVariant, NotificationKind, NotificationLogRepository } from '../domain/notificationLog';
import { SummaryService } from './summaryService';

const logger = getLogger(LogCategory.TELEGRAM);

const KIND: NotificationKind = 'daily_summary';

/** How often the scheduler looks at the clock. */
export const SUMMARY_TICK_MS = 60_000;

/** A user the summary may go to, with the settings that say when (FT-098). */
export interface SummaryRecipient {
  userId: string;
  /** The private chat with the bot has the user's Telegram id. */
  telegramId: string;
  timeZone: string | undefined;
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

/** Draws the summary and sends it to the user's chat; implemented by the bot (FT-124). */
export interface DailySummarySender {
  send(recipient: SummaryRecipient, summary: DaySummary): Promise<SentNotice>;
}

export type SummaryOutcome = 'sent' | 'asked' | 'skipped' | 'failed';

export interface TickResult {
  userId: string;
  day: string;
  outcome: SummaryOutcome;
}

/** A chat the bot can write to: a Telegram user id, not a guest or a dev id. */
const TELEGRAM_CHAT = /^\d+$/;

/**
 * The daily summary (FT-124): at the chosen time on the user's clock, once a day. The day is claimed in
 * `notifications_log` before anything is read or sent, so a second tick, a restart or a second process never
 * sends it twice — at most once: a send that failed or stopped half-way is not repeated.
 *
 * A day with records gets the summary; a day without them gets «Трат правда не было?», but not more than
 * DAILY_SUMMARY_RULES.emptyEveningsInARow evenings in a row — after that the bot is silent until something is
 * recorded again.
 */
export class DailySummaryNotifier {
  /** The day each user was handled for in this process: a tick does not ask the log again. */
  private handled = new Map<string, string>();
  private timer?: NodeJS.Timeout;
  private running = false;

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
      if (!recipient.dailySummaryEnabled || !TELEGRAM_CHAT.test(recipient.telegramId)) continue;
      const clock = localClock(now, recipient.timeZone);
      if (!isSummaryDue(clock, recipient.dailySummaryTime) || this.handled.get(recipient.userId) === clock.date) continue;
      try {
        const outcome = await this.notify(recipient, clock.date, sender);
        if (outcome) results.push({ userId: recipient.userId, day: clock.date, outcome });
        this.handled.set(recipient.userId, clock.date);
      } catch (error) {
        // The day was not claimed (the log could not be read or written): the next tick tries again
        logger.error('Daily summary failed before it was claimed', error as Error, { userId: recipient.userId, day: clock.date });
      }
    }
    return results;
  }

  /** Ticks now and then every SUMMARY_TICK_MS; one tick at a time. */
  start(sender: DailySummarySender, everyMs: number = SUMMARY_TICK_MS): void {
    if (this.timer) return;
    const run = () => {
      if (this.running) return;
      this.running = true;
      this.tick(sender)
        .catch(error => logger.error('Daily summary tick failed', error as Error))
        .finally(() => {
          this.running = false;
        });
    };
    run();
    this.timer = setInterval(run, everyMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** «Да, не было» under the empty-day question: the answer is kept with the notice. False without one. */
  async confirmNoSpending(userId: string, day: string): Promise<boolean> {
    const entry = await this.log.find(userId, KIND, day);
    if (!entry || entry.variant !== 'empty') return false;
    if (entry.answer !== 'no_spending') await this.log.update(entry.id, { answer: 'no_spending' });
    return true;
  }

  private async notify(recipient: SummaryRecipient, day: string, sender: DailySummarySender): Promise<SummaryOutcome | null> {
    const { userId } = recipient;
    if (await this.log.find(userId, KIND, day)) return null;
    const id = randomUUID();
    if (!(await this.log.claim({ id, userId, kind: KIND, period: day }))) return null;

    let variant: DailySummaryVariant | null = null;
    try {
      const summary = await this.summaries.day(userId, day);
      variant = summary.recordCount === 0 ? 'empty' : 'summary';
      if (variant === 'empty' && !(await this.mayAskAboutEmptyDay(userId, day))) {
        await this.log.update(id, { status: 'skipped', variant });
        return 'skipped';
      }
      const sent = await sender.send(recipient, summary);
      await this.log.update(id, { status: 'sent', variant, chatId: sent.chatId, messageId: sent.messageId });
      return variant === 'empty' ? 'asked' : 'sent';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Daily summary not sent', { userId, day, error: message });
      await this.log.update(id, { status: 'failed', variant, error: message.slice(0, 500) }).catch(() => undefined);
      return 'failed';
    }
  }

  /**
   * At most N empty-day questions after the user's last record: fewer than N asked so far, or a record dated on
   * or after the oldest of the last N questions (so at most N − 1 of them came after it).
   */
  private async mayAskAboutEmptyDay(userId: string, day: string): Promise<boolean> {
    const limit = DAILY_SUMMARY_RULES.emptyEveningsInARow;
    const asked = await this.log.lastSent(userId, KIND, 'empty', limit);
    if (asked.length < limit) return true;
    return this.summaries.hasRecords(userId, asked[limit - 1].period, day);
  }
}
