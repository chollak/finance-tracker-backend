/**
 * What the bot sent on its own (FT-124, FT-133, `notifications_log`): one row per user, kind and period. The row is
 * claimed before the notice is built and sent, so a notice goes out at most once — a second tick, a restart or a
 * second process over the same database finds the row and stays silent.
 */

/**
 * What the notice is, and what its `period` names:
 * - `daily_summary` — итоги дня (FT-124); the day, YYYY-MM-DD;
 * - `goal_near`, `goal_over` — a goal at 80% of its limit, over it (FT-133); the goal's id;
 * - `subscription` — a subscription the day before its charge (FT-133); `<goal id>:<reminder day>`;
 * - `audit`, `audit_again` — the audit is ready, and once more after «Позже» (FT-133); the month audited, YYYY-MM.
 */
export type NotificationKind = 'daily_summary' | 'goal_near' | 'goal_over' | 'subscription' | 'audit' | 'audit_again';

/**
 * `sending` — claimed; it stays so if the process stopped mid-way (at most once: never sent twice).
 * `skipped` — nothing to say: the third empty evening in a row. `failed` — Telegram refused it.
 */
export type NotificationStatus = 'sending' | 'sent' | 'skipped' | 'failed';

/** The daily summary of a day with records, or the question about a day without them. */
export type DailySummaryVariant = 'summary' | 'empty';

/** «Да, не было» under the empty-day question; «Позже» under the audit call (FT-133). */
export type NotificationAnswer = 'no_spending' | 'later';

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
  /** «Позже»: the day the notice comes again, YYYY-MM-DD. */
  dueOn: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationChanges = Partial<Pick<NotificationEntry, 'status' | 'variant' | 'chatId' | 'messageId' | 'answer' | 'error' | 'dueOn'>>;

export interface NotificationLogRepository {
  /** Writes the row unless the user has one of this kind for the period; true when this call wrote it. */
  claim(input: { id: string; userId: string; kind: NotificationKind; period: string }): Promise<boolean>;
  find(userId: string, kind: NotificationKind, period: string): Promise<NotificationEntry | null>;
  update(id: string, changes: NotificationChanges): Promise<void>;
  /** Notices of this kind and variant that went out, newest period first. */
  lastSent(userId: string, kind: NotificationKind, variant: DailySummaryVariant, limit: number): Promise<NotificationEntry[]>;
}
