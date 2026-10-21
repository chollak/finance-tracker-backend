/**
 * The spending audit and its goals as the API gives them (FT-131, FT-142; docs/pastel/api.md «Ревизия трат и цели»).
 * Amounts are сум minor units; dates are YYYY-MM-DD, the day in Tashkent.
 */

/** «Подписка», «Платный тариф», «Часто и понемногу», «Стало чаще», «Крупная покупка». */
export type AuditCandidateKind = 'subscription' | 'tariff' | 'frequent_small' | 'more_often' | 'large_purchase';
/** «Нужно» or «Лишнее». */
export type AuditDecision = 'need' | 'extra';
/** «Вдвое меньше» or «Отказаться». */
export type GoalChoice = 'half' | 'drop';
/** The goal a decision makes: «Вдвое меньше», «Отказаться», «Отменить» a subscription or paid tariff. */
export type GoalKind = 'half' | 'drop' | 'cancel';

export interface AuditOperation {
  id: string;
  date: string;
  amountMinor: number;
}

/** One spending of the audit: what the rules found and what was decided. */
export interface AuditCandidate {
  id: string;
  kind: AuditCandidateKind;
  /** «Часто и понемногу». */
  kindLabel: string;
  categoryId: string;
  categoryName: string;
  /** «Такси», «Кинопоиск». */
  name: string;
  /** «Такси — 13 раз»; a subscription and a purchase — just the name. */
  title: string;
  /** What it took in its month; a large purchase — the purchase alone. */
  amountMinor: number;
  count: number;
  /** It repeats, so a goal may limit it: everything but a large purchase. */
  recurring: boolean;
  /** A month of it if it goes on; 0 for a one-off purchase. */
  monthlyMinor: number;
  /** Newest first. */
  operations: AuditOperation[];
  previous: { count: number; amountMinor: number } | null;
  /** A statement with numbers: «В августе — 2 раза на 352 000 сум: вдвое чаще и на 380 000 сум больше.» */
  reason: string;
  serviceKey: string | null;
  /** The month of the audit it was left undecided in («2026-08»); null for one found by this audit. */
  carriedFrom: string | null;
  decision: AuditDecision | null;
  /** The goal last chosen; kept when the mark is taken back. */
  goalChoice: GoalChoice | null;
  /** The goal the decision makes now. */
  goal: GoalKind | null;
  /** «Вдвое меньше» would limit it to this a month; null for a service or a one-off purchase. */
  halfLimitMinor: number | null;
  /** What its goal saves a month now. */
  savingMinor: number;
}

export interface AuditSummary {
  /** All the candidates, those brought from the audit before included: «Разобрано 2 из 6». */
  count: number;
  marked: number;
  /** Not decided: they go into the next audit. */
  left: number;
  extraCount: number;
  needCount: number;
  goalCount: number;
  /** The month audited only: «— 2 319 000 сум за сентябрь». */
  totalMinor: number;
  /** Saved a month if the goals are kept: «814 000 сум в месяц». */
  planMinor: number;
  /** The month audited only: «В сентябре на лишнее ушло 1 504 000 сум». */
  wastedMinor: number;
  carriedCount: number;
  carriedTotalMinor: number;
  carriedWastedMinor: number;
}

/** «С 1 октября — 262 400 сум, за те же дни сентября — 184 000 сум: на 43% больше». */
export interface GoalComparison {
  from: string;
  amountMinor: number;
  previousFrom: string;
  previousTo: string;
  previousMinor: number;
  /** Whole percent, negative when less. */
  percent: number;
}

/** «По этим тратам с 1 октября — …, за те же дни сентября — …: уже на 53% меньше». */
export interface CombinedComparison {
  amountMinor: number;
  previousMinor: number;
  percent: number;
}

/** «Уже отменено», «Напомнить» or no answer yet. */
export type SubscriptionAnswer = 'cancelled' | 'remind' | null;

export interface GoalSubscription {
  state: SubscriptionAnswer;
  lastChargeOn: string | null;
  /** «Следующее списание — 3 ноября». */
  nextChargeOn: string | null;
  /** The day kept by «Напомнить», else the day it would remind; null once cancelled. */
  remindOn: string | null;
}

/** A goal after the audit with how it goes today. */
export interface Goal {
  id: string;
  auditId: string;
  kind: GoalKind;
  name: string;
  categoryId: string;
  categoryName: string;
  serviceKey: string | null;
  /** `cancel` only: a subscription («отменить») or an operator's paid tariff («отключить»). */
  serviceKind: 'subscription' | 'tariff' | null;
  monthlyMinor: number;
  /** «лимит 175 000 сум в месяц»; 0 unless «Вдвое меньше». */
  limitMinor: number;
  savingMinor: number;
  startsOn: string;
  endsOn: string;
  /** The limit from the audit day to the month's end: «из 102 000 сум до 31 октября». */
  periodLimitMinor: number;
  spentMinor: number;
  count: number;
  comparison: GoalComparison | null;
  subscription: GoalSubscription | null;
}

/** `GET /api/audits/current`: the audit of the month before today. */
export interface Audit {
  /** null while it is too early for an audit. */
  id: string | null;
  /** The month audited, YYYY-MM. */
  month: string;
  today: string;
  /** `too_early` — the month was not recorded whole; `open` — before «Готово»; `done` — after. */
  state: 'too_early' | 'open' | 'done';
  /** `too_early` only: the day of the first record and when the first audit opens. */
  firstRecordDate: string | null;
  firstAuditOn: string | null;
  /** «Следующая ревизия — 1 ноября». */
  nextAuditOn: string;
  /** The audit day: the first «Готово». */
  doneOn: string | null;
  candidates: AuditCandidate[];
  summary: AuditSummary;
  goals: Goal[];
  comparison: CombinedComparison | null;
}

/** `GET /api/goals`: the goals counting today — «Цели после ревизии» on Home. */
export interface Goals {
  today: string;
  startsOn: string | null;
  endsOn: string | null;
  goals: Goal[];
  planMinor: number;
  comparison: CombinedComparison | null;
}

/** One press on a candidate: «Нужно / Лишнее» (null takes the mark back) or «Вдвое меньше / Отказаться». */
export type CandidateChange = { decision: AuditDecision | null } | { goal: GoalChoice };
