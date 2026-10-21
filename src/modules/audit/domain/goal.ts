import { addDaysToDateOnly } from '../../../shared/domain/dates/dateOnly';
import { daysInMonth, shiftMonth } from '../../transaction/domain/monthAnalytics';
import { AuditItem, GoalKind, goalOf } from './audit';
import { AuditRecord, isSameAuditSpending, spendingNoteKey } from './auditRules';
import { GOAL_RULES, halfLimitMinor, roundToThousand } from './goalMath';
import { findSubscription } from './subscriptionCatalog';

export { GOAL_RULES, halfLimitMinor, roundToThousand };

/** «Уже отменено» or «Напомнить» of a subscription to cancel. */
export type SubscriptionState = 'cancelled' | 'remind';

/**
 * A goal after the audit (FT-131, table `goals`), made by «Готово» from an extra repeating spending: «Вдвое меньше»,
 * «Отказаться» or «Отменить» a subscription. It counts from the audit day to the end of that month («Цели считаются с
 * дня ревизии»); the next audit sets the next month's goals.
 */
export interface Goal {
  id: string;
  userId: string;
  auditId: string;
  /** The audit candidate it was made from. */
  candidateId: string;
  kind: GoalKind;
  /** The spending: «Такси», «Кинопоиск». */
  name: string;
  categoryId: string;
  /** The spending's note group in its category (`spendingNoteKey`); null for a service of the catalog. */
  noteKey: string | null;
  serviceKey: string | null;
  /** A month of the spending, as the audit found it. */
  monthlyMinor: number;
  /** «Вдвое меньше»: the month's limit, to a thousand сум; 0 for the other goals. */
  limitMinor: number;
  /** The audit day, YYYY-MM-DD. */
  startsOn: string;
  /** The last day of the audit day's month. */
  endsOn: string;
  /** A subscription: its last charge the audit saw, and the months from one charge to the next (12 for a yearly one). */
  lastChargeOn: string | null;
  chargeMonths: number | null;
  subscriptionState: SubscriptionState | null;
  /** «Напомнить»: the day the bot reminds (FT-133), the day before the next charge. */
  remindOn: string | null;
  /** «Уже отменено»: the day it was pressed. A charge after it brings the subscription into the next audit again. */
  cancelledOn: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** What «Готово» writes for a candidate: the goal without its subscription answers. */
export type GoalDraft = Pick<
  Goal,
  'candidateId' | 'kind' | 'name' | 'categoryId' | 'noteKey' | 'serviceKey' | 'monthlyMinor' | 'limitMinor' | 'startsOn' | 'endsOn' | 'lastChargeOn' | 'chargeMonths'
>;

const pad = (value: number) => String(value).padStart(2, '0');
const dayOf = (date: string) => Number(date.slice(8, 10));
const total = (records: readonly AuditRecord[]) => records.reduce((sum, record) => sum + record.amountMinor, 0);
const latest = (dates: ReadonlyArray<string | null>) =>
  dates.reduce<string | null>((last, date) => (date && (!last || date > last) ? date : last), null);

/** The goal a decided candidate makes on the audit day `doneOn`, or null (`goalOf`). */
export function goalDraftOf(item: AuditItem, doneOn: string): GoalDraft | null {
  const kind = goalOf(item);
  if (!kind) return null;
  const month = doneOn.slice(0, 7);
  const subscription = kind === 'cancel';
  return {
    candidateId: item.id,
    kind,
    name: item.name,
    categoryId: item.categoryId,
    noteKey: item.noteKey,
    serviceKey: item.serviceKey,
    monthlyMinor: item.monthlyMinor,
    limitMinor: kind === 'half' ? halfLimitMinor(item.monthlyMinor) : 0,
    startsOn: doneOn,
    endsOn: `${month}-${pad(daysInMonth(month))}`,
    lastChargeOn: subscription ? latest(item.operations.map(operation => operation.date)) : null,
    // A yearly charge spread over 12 months (FT-130 `monthlyMinor`) comes back in 12 months
    chargeMonths: subscription ? Math.max(1, Math.round(item.amountMinor / Math.max(1, item.monthlyMinor))) : null,
  };
}

/** What the goal saves a month: the month given up or cancelled; for «Вдвое меньше», the part above the limit. */
export function goalSavingMinor(goal: Pick<Goal, 'kind' | 'monthlyMinor' | 'limitMinor'>): number {
  return goal.kind === 'half' ? goal.monthlyMinor - goal.limitMinor : goal.monthlyMinor;
}

/** Whether a record is the goal's spending — the same spending as the audit tells it (`isSameAuditSpending`). */
export function isGoalSpending(goal: Pick<Goal, 'categoryId' | 'noteKey' | 'serviceKey'>, record: AuditRecord): boolean {
  const service = findSubscription(record.note);
  return isSameAuditSpending(
    { categoryId: record.categoryId, noteKey: service ? null : spendingNoteKey(record.note, record.categoryName), serviceKey: service?.key ?? null },
    goal
  );
}

/** The same day `months` later, or the month's last day when it is shorter: 31 January + 1 → 28 February. */
export function addMonthsClipped(date: string, months: number): string {
  const month = shiftMonth(date.slice(0, 7), months);
  return `${month}-${pad(Math.min(dayOf(date), daysInMonth(month)))}`;
}

/** The first charge after `today`, counted from the last one every `chargeMonths` months, on its day of the month. */
export function nextChargeOn(lastChargeOn: string, chargeMonths: number, today: string): string {
  let next = lastChargeOn;
  for (let step = 1; next <= today && step <= 1200; step++) next = addMonthsClipped(lastChargeOn, step * chargeMonths);
  return next;
}

/** «Напомнить 2 ноября»: the day before the charge, but not before today. */
export function suggestedRemindOn(nextCharge: string, today: string): string {
  const dayBefore = addDaysToDateOnly(nextCharge, -1);
  return dayBefore > today ? dayBefore : today;
}

/** «С 1 октября — 262 400 сум, за те же дни сентября — 184 000 сум: на 43% больше». */
export interface GoalComparison {
  /** The 1st of the goal's month; the whole month is counted, as on Home's tiles and in analytics (FT-141). */
  from: string;
  amountMinor: number;
  /** The same days of the month before: from its 1st to today's day (its last day when shorter). */
  previousFrom: string;
  previousTo: string;
  previousMinor: number;
  /** Whole percent, negative when less: −54. */
  percent: number;
}

export interface GoalSubscription {
  state: SubscriptionState | null;
  lastChargeOn: string | null;
  /** «Следующее списание — 3 ноября». */
  nextChargeOn: string | null;
  /** The day kept by «Напомнить», else the day it would remind; null once cancelled. */
  remindOn: string | null;
}

export interface GoalProgress {
  /** «Вдвое меньше»: the limit from the audit day to the month's end — the month's limit by the days left, to a thousand. */
  periodLimitMinor: number;
  /** Spent on it from the audit day to the end of the month: «Потрачено 24 000 из 102 000 сум до 31 октября». */
  spentMinor: number;
  count: number;
  /** Null for a subscription, and when the same days of the month before had none of it. */
  comparison: GoalComparison | null;
  subscription: GoalSubscription | null;
}

const percentOf = (amount: number, previous: number) => Math.round(((amount - previous) / previous) * 100);

/**
 * How a goal goes on `today`, from the user's real expenses (`auditRecordsOf`) of its month and the one before; for a
 * subscription, its charges up to today. The audit day counts in the goal and its month counts whole, as Home's tiles.
 */
export function goalProgress(goal: Goal, records: readonly AuditRecord[], today: string): GoalProgress {
  const own = records.filter(record => record.amountMinor > 0 && isGoalSpending(goal, record));
  const month = goal.startsOn.slice(0, 7);
  const days = daysInMonth(month);
  const since = own.filter(record => record.date >= goal.startsOn && record.date <= goal.endsOn);
  const periodLimitMinor = goal.kind === 'half' ? roundToThousand((goal.limitMinor * (days - dayOf(goal.startsOn) + 1)) / days) : 0;

  let comparison: GoalComparison | null = null;
  let subscription: GoalSubscription | null = null;
  if (goal.kind === 'cancel') {
    const lastChargeOn = latest([goal.lastChargeOn, ...own.filter(record => record.date <= today).map(record => record.date)]);
    const next = lastChargeOn ? nextChargeOn(lastChargeOn, goal.chargeMonths ?? 1, today) : null;
    const suggested = next ? suggestedRemindOn(next, today) : null;
    subscription = {
      state: goal.subscriptionState,
      lastChargeOn,
      nextChargeOn: next,
      remindOn: goal.subscriptionState === 'remind' ? goal.remindOn : goal.subscriptionState === 'cancelled' ? null : suggested,
    };
  } else {
    const previousMonth = shiftMonth(month, -1);
    const throughDay = today.slice(0, 7) === month ? dayOf(today) : days;
    const previousTo = `${previousMonth}-${pad(Math.min(throughDay, daysInMonth(previousMonth)))}`;
    const amountMinor = total(own.filter(record => record.date >= `${month}-01` && record.date <= goal.endsOn));
    const previousMinor = total(own.filter(record => record.date >= `${previousMonth}-01` && record.date <= previousTo));
    if (previousMinor > 0) {
      comparison = { from: `${month}-01`, amountMinor, previousFrom: `${previousMonth}-01`, previousTo, previousMinor, percent: percentOf(amountMinor, previousMinor) };
    }
  }

  return { periodLimitMinor, spentMinor: total(since), count: since.length, comparison, subscription };
}

/** The one line of the summary: «По этим тратам с 1 октября — 365 400 сум, за те же дни сентября — 774 000 сум: уже на 53% меньше». */
export function combinedComparison(comparisons: ReadonlyArray<GoalComparison | null>): { amountMinor: number; previousMinor: number; percent: number } | null {
  const present = comparisons.filter((comparison): comparison is GoalComparison => comparison !== null);
  if (present.length === 0) return null;
  const amountMinor = present.reduce((sum, comparison) => sum + comparison.amountMinor, 0);
  const previousMinor = present.reduce((sum, comparison) => sum + comparison.previousMinor, 0);
  return { amountMinor, previousMinor, percent: percentOf(amountMinor, previousMinor) };
}
