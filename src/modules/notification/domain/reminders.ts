import { addDaysToDateOnly } from '../../../shared/domain/dates/dateOnly';
import { shiftMonth } from '../../transaction/domain/monthAnalytics';
import { LocalClock } from './dailySummary';

/**
 * The bot's reminders after the audit (FT-133, BotNotice.md, board «Бот · напоминания», design-system «Уведомления
 * редкие»): a goal once at 80% of its limit and once over it, a subscription the day before its charge, the audit on
 * the 1st at the chosen time — and «Позже» brings the audit back only once.
 */
export const REMINDER_RULES = {
  /** «Цель — один раз на 80% и один раз на превышение»: the share of the limit since the audit day. */
  goalNearShare: 0.8,
  /**
   * «Днём» (the sheet «Цели и подписки»): a goal is told from this time until `dayUntil` on the user's clock; a goal
   * that crossed at night is told in the morning, while it still counts.
   */
  dayFrom: '10:00',
  dayUntil: '22:00',
  /** A subscription is told on its reminder day from this time; the charge is tomorrow, so a late reminder still helps. */
  subscriptionFrom: '10:00',
} as const;

export type GoalAlertLevel = 'near' | 'over';

/** 80% of the limit or more — `near`; more than the limit — `over`; null below 80% or without a limit. */
export function goalAlertLevel(spentMinor: number, limitMinor: number): GoalAlertLevel | null {
  if (limitMinor <= 0) return null;
  if (spentMinor > limitMinor) return 'over';
  return spentMinor >= limitMinor * REMINDER_RULES.goalNearShare ? 'near' : null;
}

/** A goal alert may go out at this time (HH:MM, the user's clock). */
export function isGoalAlertTime(time: string): boolean {
  return time >= REMINDER_RULES.dayFrom && time < REMINDER_RULES.dayUntil;
}

/** A subscription reminder may go out at this time on its day. */
export function isSubscriptionReminderTime(time: string): boolean {
  return time >= REMINDER_RULES.subscriptionFrom;
}

/**
 * The audit is called on the 1st from the chosen time until the day ends — a bot that was down at 10:00 calls at
 * 12:00, one that starts on the 2nd does not: the invitation on Home is there all month.
 */
export function isAuditCallDue(clock: LocalClock, auditTime: string): boolean {
  return isAuditDay(clock.date) && clock.time >= auditTime;
}

/** The audit is called on the 1st of the month (YYYY-MM-DD). */
export function isAuditDay(day: string): boolean {
  return day.endsWith('-01');
}

/** The month whose audit is held on `today`: the month before («Ревизия октября» on 1 November). */
export function auditMonthOf(today: string): string {
  return shiftMonth(today.slice(0, 7), -1);
}

/** «Позже»: the audit is called again the next day. */
export function auditCallAgainOn(today: string): string {
  return addDaysToDateOnly(today, 1);
}

/** A «Вдвое меньше» goal counting today, with what was spent on it since the audit day. */
export interface LimitGoal {
  id: string;
  name: string;
  spentMinor: number;
  /** The limit from the audit day to the end of the month. */
  limitMinor: number;
  /** The last day of the goal's month. */
  endsOn: string;
}

/** A subscription or paid tariff whose «Напомнить» day is today. */
export interface SubscriptionDue {
  id: string;
  name: string;
  serviceKind: 'subscription' | 'tariff';
  /** The next charge, YYYY-MM-DD. */
  chargeOn: string;
  /** What it charges: the last charge. */
  chargeMinor: number;
}

/** The audit held today: the month audited, whether it is open, and how many spendings wait for a mark. */
export interface ReminderAudit {
  month: string;
  state: 'too_early' | 'open' | 'done';
  left: number;
}

/** «Отменено» or «Оставить» under a subscription reminder. */
export type SubscriptionAnswer = 'cancelled' | 'keep';

/** The subscription a reminder was answered about: what the answer says. */
export interface AnsweredSubscription {
  name: string;
  serviceKind: 'subscription' | 'tariff';
  /** What cancelling it saves a month. */
  monthlyMinor: number;
}

/**
 * What the reminders read and change in the audit module (FT-131), wired in `createModules()`. `today` is the user's
 * day, YYYY-MM-DD.
 */
export interface ReminderSources {
  /** The audit held today, opened as the screen opens it. */
  audit(userId: string, today: string): Promise<ReminderAudit>;
  /** The «Вдвое меньше» goals counting today and the subscriptions to remind of today. */
  goals(userId: string, today: string): Promise<{ limits: LimitGoal[]; subscriptions: SubscriptionDue[] }>;
  /**
   * «Отменено» — the goal is answered «Уже отменено», as in the app; «Оставить» — the goal goes and the spending counts
   * as needed. Null when the goal is not the user's or is gone.
   */
  answerSubscription(userId: string, goalId: string, answer: SubscriptionAnswer, today: string): Promise<AnsweredSubscription | null>;
}

/** What a reminder says; the bot draws it (FT-133). `today` is the user's day the notice goes out on. */
export type ReminderNotice =
  | { kind: 'goal_near' | 'goal_over'; today: string; goal: LimitGoal }
  | { kind: 'subscription'; today: string; goal: SubscriptionDue }
  | { kind: 'audit'; month: string; left: number; repeat: boolean };
