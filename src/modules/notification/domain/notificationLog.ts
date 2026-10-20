/**
 * What the bot sent on its own (FT-124, `notifications_log`): one row per user, kind and period. The row is
 * claimed before the notice is built and sent, so a notice goes out at most once — a second tick, a restart or a
 * second process over the same database finds the row and stays silent.
 */

/** The daily summary for now; goal, subscription and audit notices come with FT-131+. */
export type NotificationKind = 'daily_summary';

/**
 * `sending` — claimed; it stays so if the process stopped mid-way (at most once: never sent twice).
 * `skipped` — nothing to say: the third empty evening in a row. `failed` — Telegram refused it.
 */
export type NotificationStatus = 'sending' | 'sent' | 'skipped' | 'failed';

/** The daily summary of a day with records, or the question about a day without them. */
export type DailySummaryVariant = 'summary' | 'empty';

/** «Да, не было» under the empty-day question. */
export type NotificationAnswer = 'no_spending';

export interface NotificationEntry {
  id: string;
  userId: string;
  kind: NotificationKind;
  /** The period the notice is about: YYYY-MM-DD for a day. */
  period: string;
  status: NotificationStatus;
  variant: DailySummaryVariant | null;
  chatId: string | null;
  messageId: number | null;
  answer: NotificationAnswer | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationChanges = Partial<Pick<NotificationEntry, 'status' | 'variant' | 'chatId' | 'messageId' | 'answer' | 'error'>>;

export interface NotificationLogRepository {
  /** Writes the row unless the user has one of this kind for the period; true when this call wrote it. */
  claim(input: { id: string; userId: string; kind: NotificationKind; period: string }): Promise<boolean>;
  find(userId: string, kind: NotificationKind, period: string): Promise<NotificationEntry | null>;
  update(id: string, changes: NotificationChanges): Promise<void>;
  /** Notices of this kind and variant that went out, newest period first. */
  lastSent(userId: string, kind: NotificationKind, variant: DailySummaryVariant, limit: number): Promise<NotificationEntry[]>;
}
