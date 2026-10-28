/**
 * What the bot sent on its own (FT-124, FT-133, `notifications_log`): one row per user, kind and period. The row is
 * claimed before the notice is built and sent, so a notice goes out at most once — a second tick, a restart or a
 * second process over the same database finds the row and stays silent.
 */

/**
 * What the notice is, and what its `period` names:
 * - `daily_summary` — итоги дня (FT-124); the day, YYYY-MM-DD;
 * - `daily_summary_late` — «Итоги за вчера», the summary of a day that did not go out by its midnight, the next
 *   morning (FT-164); the day it is about;
 * - `goal_near`, `goal_over` — a goal at 80% of its limit, over it (FT-133); the goal's id;
 * - `subscription` — a subscription the day before its charge (FT-133); `<goal id>:<reminder day>`;
 * - `audit`, `audit_again` — the audit is ready, and once more after «Позже» (FT-133); the month audited, YYYY-MM.
 */
export type NotificationKind =
  | 'daily_summary'
  | 'daily_summary_late'
  | 'goal_near'
  | 'goal_over'
  | 'subscription'
  | 'audit'
  | 'audit_again';

/**
 * `sending` — claimed and being sent; it stays so if the process stopped mid-way (at most once: never sent twice).
 * `not_sent` — the request never left the machine (no network after sleep), or a notice waits for its time: the next
 * tick takes it back with an atomic `UPDATE … WHERE status = 'not_sent'` until its last day (`sendUntil`), then it is
 * kept `failed` with the reason (FT-164). `skipped` — nothing to say: the third empty evening in a row. `failed` —
 * Telegram refused it, the request may have reached it (a timeout, a reset), or it did not leave before its window ended.
 */
export type NotificationStatus = 'sending' | 'not_sent' | 'sent' | 'skipped' | 'failed';

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
  /** Telegram's refusal, the last error of a request that never left, or why it was closed as failed. */
  error: string | null;
  /** «Позже»: the day the notice comes again, YYYY-MM-DD. */
  dueOn: string | null;
  /** How many times it was tried; 0 for a notice waiting for its time, and for rows kept before FT-164. */
  attempts: number;
  /** The last day (YYYY-MM-DD, the user's clock) it may still go out; null for rows kept before FT-164. */
  sendUntil: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationChanges = Partial<
  Pick<NotificationEntry, 'status' | 'variant' | 'chatId' | 'messageId' | 'answer' | 'error' | 'dueOn' | 'attempts'>
>;

export interface NotificationClaim {
  id: string;
  userId: string;
  kind: NotificationKind;
  period: string;
  /** The last day it may still go out, if it does not leave now. */
  sendUntil: string;
  /** Kept `not_sent` with no attempt yet, for a later tick to send (FT-164); by default claimed `sending`, attempt 1. */
  waiting?: boolean;
}

export interface NotificationLogRepository {
  /** Writes the row unless the user has one of this kind for the period; true when this call wrote it. */
  claim(input: NotificationClaim): Promise<boolean>;
  find(userId: string, kind: NotificationKind, period: string): Promise<NotificationEntry | null>;
  update(id: string, changes: NotificationChanges): Promise<void>;
  /** Changes the row only while it is in `from`: true when this call changed it — of two ticks one wins (FT-164). */
  transition(id: string, from: NotificationStatus, changes: NotificationChanges): Promise<boolean>;
  /** The user's notices of these kinds still `not_sent` whose last day is before `today` (FT-164). */
  expired(userId: string, kinds: readonly NotificationKind[], today: string): Promise<NotificationEntry[]>;
  /** Whether the user has a notice of this kind for a period before this one, whatever became of it (FT-164). */
  hasEarlier(userId: string, kind: NotificationKind, period: string): Promise<boolean>;
  /** Notices of these kinds and this variant that went out, newest period first. */
  lastSent(userId: string, kinds: readonly NotificationKind[], variant: DailySummaryVariant, limit: number): Promise<NotificationEntry[]>;
}
