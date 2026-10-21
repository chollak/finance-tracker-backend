import { shiftMonth } from '../../transaction/domain/monthAnalytics';
import { AUDIT_RULES, AuditCandidate, isSameAuditSpending } from './auditRules';
import { halfLimitMinor } from './goalMath';

/**
 * The audit of a month as it is kept (FT-131, table `audits`): the candidates the rules found when it was opened
 * (FT-130), what the person decided about each — «Нужно» or «Лишнее» — and the goal chosen for the extra; «Готово»
 * gives it its day, from which the goals count (design-system «Ревизия трат»).
 */
export type AuditDecision = 'need' | 'extra';
/** «Вдвое меньше» or «Отказаться» — what a repeating extra spending becomes. */
export type GoalChoice = 'half' | 'drop';
/** The goal a decision makes: «Вдвое меньше», «Отказаться», or «Отменить» a subscription or paid tariff. */
export type GoalKind = 'half' | 'drop' | 'cancel';

export const AUDIT_DECISION_RULES = {
  /**
   * A spending marked «Нужно» is not offered again («Предложим снова, только если трата заметно вырастет») until its
   * month is at least this many times what it was when marked; a subscription or tariff — until it is dearer by more
   * than `AUDIT_RULES.subscriptionPriceChange`, the share that makes it «подорожала».
   */
  needAgainRatio: 1.5,
} as const;

/** A candidate as the audit keeps it. */
export interface AuditItem extends AuditCandidate {
  /** The candidate's id within the audit (the API's). */
  id: string;
  /**
   * The month of the audit it was left undecided in, for one brought into this audit («В неё войдут и 2 неразобранные
   * траты»); null for one this audit's rules found. Its numbers and reason stay those of that month.
   */
  carriedFrom: string | null;
  decision: AuditDecision | null;
  /** The goal last chosen for it; kept when the mark is taken back, so «Лишнее» again brings it back. */
  goalChoice: GoalChoice | null;
}

export interface Audit {
  id: string;
  userId: string;
  /** The month audited, YYYY-MM: September's audit is held in October. */
  month: string;
  items: AuditItem[];
  /** The audit day, YYYY-MM-DD: the first «Готово». Goals count from it; null until then. */
  doneOn: string | null;
  /** Grows with every write: a write made on an older version is refused and read again. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export const isServiceCandidate = (candidate: Pick<AuditCandidate, 'kind'>) => candidate.kind === 'subscription' || candidate.kind === 'tariff';

/** The month whose audit is held on `today`: the month before («Ревизия сентября» in October). */
export function auditMonthOn(today: string): string {
  return shiftMonth(today.slice(0, 7), -1);
}

/** The day the next audit opens: the 1st of the month after `today`'s («Следующая ревизия — 1 ноября»). */
export function nextAuditOn(today: string): string {
  return `${shiftMonth(today.slice(0, 7), 1)}-01`;
}

/**
 * The goal a decision makes: a repeating extra spending — «Вдвое меньше» unless «Отказаться» was chosen; a
 * subscription or paid tariff — only «Отменить». A one-off purchase, a needed spending and one not decided make none.
 */
export function goalOf(item: Pick<AuditItem, 'kind' | 'recurring' | 'decision' | 'goalChoice'>): GoalKind | null {
  if (item.decision !== 'extra' || !item.recurring) return null;
  if (isServiceCandidate(item)) return 'cancel';
  return item.goalChoice ?? 'half';
}

/** What the goal saves a month: a month of the spending given up or cancelled; for «Вдвое меньше», the part above the limit. */
export function savingOf(item: AuditItem): number {
  const goal = goalOf(item);
  if (goal === 'half') return item.monthlyMinor - halfLimitMinor(item.monthlyMinor);
  return goal === 'drop' || goal === 'cancel' ? item.monthlyMinor : 0;
}

/** What went on the extra in the month audited: the whole spending; for «Вдвое меньше», only the part above the limit. */
export function wastedOf(item: AuditItem): number {
  if (item.decision !== 'extra') return 0;
  if (goalOf(item) === 'half') return Math.max(0, item.amountMinor - halfLimitMinor(item.monthlyMinor));
  return item.amountMinor;
}

export interface AuditSummary {
  count: number;
  /** Decided: «Разобрано 2 из 6». */
  marked: number;
  /** Not decided: they go into the next audit. */
  left: number;
  extraCount: number;
  needCount: number;
  goalCount: number;
  /** All the candidates: «— 2 319 000 сум за сентябрь». */
  totalMinor: number;
  /** Saved a month if the goals are kept: «814 000 сум в месяц», never with a minus. */
  planMinor: number;
  /** «В сентябре на лишнее ушло 1 504 000 сум». */
  wastedMinor: number;
}

export function auditSummary(items: readonly AuditItem[]): AuditSummary {
  const marked = items.filter(item => item.decision !== null).length;
  return {
    count: items.length,
    marked,
    left: items.length - marked,
    extraCount: items.filter(item => item.decision === 'extra').length,
    needCount: items.filter(item => item.decision === 'need').length,
    goalCount: items.filter(item => goalOf(item) !== null).length,
    totalMinor: items.reduce((total, item) => total + item.amountMinor, 0),
    planMinor: items.reduce((total, item) => total + savingOf(item), 0),
    wastedMinor: items.reduce((total, item) => total + wastedOf(item), 0),
  };
}

/** The newest charge of a candidate's operations. */
const lastOperationDate = (candidate: AuditCandidate) =>
  candidate.operations.reduce((last, operation) => (operation.date > last ? operation.date : last), '');

/** Whether a spending marked «Нужно» grew enough since to be offered again. */
function grownSince(candidate: AuditCandidate, needed: AuditItem): boolean {
  if (isServiceCandidate(candidate)) return candidate.monthlyMinor > needed.monthlyMinor * (1 + AUDIT_RULES.subscriptionPriceChange);
  return candidate.amountMinor >= needed.amountMinor * AUDIT_DECISION_RULES.needAgainRatio;
}

/**
 * The candidates a new audit of `month` starts with (all undecided):
 * - what the rules found (`found`, FT-130), except a spending whose latest decision in an earlier audit was «Нужно»
 *   and that has not grown notably since, and a service marked «Уже отменено» and not charged after that day;
 * - then what was left undecided in the audit of the month before and the rules did not find again, largest first,
 *   with `carriedFrom`. A candidate is brought once: left undecided again, it comes back only if the rules find it.
 * The same spending in two audits is told by `isSameAuditSpending`.
 */
export function openAuditItems(input: {
  month: string;
  found: readonly AuditCandidate[];
  /** The user's audits of earlier months, in any order. */
  earlier: ReadonlyArray<Pick<Audit, 'month' | 'items'>>;
  /** Services marked «Уже отменено», with the day. */
  cancelled: ReadonlyArray<{ serviceKey: string; cancelledOn: string }>;
  newId: () => string;
}): AuditItem[] {
  const earlier = [...input.earlier].filter(audit => audit.month < input.month).sort((a, b) => b.month.localeCompare(a.month));
  const decided = earlier.flatMap(audit => audit.items.filter(item => item.decision !== null));

  const fresh = input.found
    .filter(candidate => {
      if (candidate.serviceKey !== null) {
        const lastCharge = lastOperationDate(candidate);
        if (input.cancelled.some(entry => entry.serviceKey === candidate.serviceKey && lastCharge <= entry.cancelledOn)) return false;
      }
      const latest = decided.find(item => isSameAuditSpending(item, candidate));
      return !(latest?.decision === 'need' && !grownSince(candidate, latest));
    })
    .map(candidate => ({ ...candidate, id: input.newId(), carriedFrom: null, decision: null, goalChoice: null }));

  const before = earlier.find(audit => audit.month === shiftMonth(input.month, -1));
  const carried = (before?.items ?? [])
    .filter(item => item.decision === null && item.carriedFrom === null)
    .filter(item => !input.found.some(candidate => isSameAuditSpending(candidate, item)))
    .sort((a, b) => b.amountMinor - a.amountMinor)
    .map(item => ({ ...item, id: input.newId(), carriedFrom: before!.month }));

  return [...fresh, ...carried];
}
