import type { Audit, AuditCandidate, AuditSummary, CandidateChange, Goal, GoalKind, SubscriptionAnswer } from './types';

/**
 * A press shown before the server answers (FT-132): the card, «Разобрано 2 из 6» and the footer's saving move at once.
 * The numbers follow the server's own rules (src/modules/audit/domain/audit.ts, FT-131 and FT-142); its answer then
 * takes the place of this guess.
 */

const isService = (candidate: Pick<AuditCandidate, 'kind'>) => candidate.kind === 'subscription' || candidate.kind === 'tariff';

/** The goal a decision makes: a repeating extra — «Вдвое меньше» unless «Отказаться»; a service — «Отменить». */
function goalOf(candidate: AuditCandidate): GoalKind | null {
  if (candidate.decision !== 'extra' || !candidate.recurring) return null;
  if (isService(candidate)) return 'cancel';
  return candidate.goalChoice ?? 'half';
}

/** What the goal saves a month: for «Вдвое меньше» the part above the limit, else the whole month. */
function savingOf(candidate: AuditCandidate, goal: GoalKind | null): number {
  if (goal === 'half') return candidate.monthlyMinor - (candidate.halfLimitMinor ?? 0);
  return goal ? candidate.monthlyMinor : 0;
}

/** What went on the extra in its month: for «Вдвое меньше» only the part above the limit. */
function wastedOf(candidate: AuditCandidate): number {
  if (candidate.decision !== 'extra') return 0;
  if (candidate.goal === 'half') return Math.max(0, candidate.amountMinor - (candidate.halfLimitMinor ?? 0));
  return candidate.amountMinor;
}

const total = (candidates: readonly AuditCandidate[], amount: (candidate: AuditCandidate) => number) =>
  candidates.reduce((sum, candidate) => sum + amount(candidate), 0);

/** The audit's numbers; the month's sum and «на лишнее ушло» are of the month audited, the brought ones apart. */
function summaryOf(candidates: readonly AuditCandidate[]): AuditSummary {
  const marked = candidates.filter((candidate) => candidate.decision !== null).length;
  const own = candidates.filter((candidate) => candidate.carriedFrom === null);
  const carried = candidates.filter((candidate) => candidate.carriedFrom !== null);
  return {
    count: candidates.length,
    marked,
    left: candidates.length - marked,
    extraCount: candidates.filter((candidate) => candidate.decision === 'extra').length,
    needCount: candidates.filter((candidate) => candidate.decision === 'need').length,
    goalCount: candidates.filter((candidate) => candidate.goal !== null).length,
    totalMinor: total(own, (candidate) => candidate.amountMinor),
    planMinor: total(candidates, (candidate) => candidate.savingMinor),
    wastedMinor: total(own, wastedOf),
    carriedCount: carried.length,
    carriedTotalMinor: total(carried, (candidate) => candidate.amountMinor),
    carriedWastedMinor: total(carried, wastedOf),
  };
}

/** «Нужно / Лишнее» (null takes it back) or «Вдвое меньше / Отказаться» on one candidate. */
export function applyCandidateChange(audit: Audit, candidateId: string, change: CandidateChange): Audit {
  if (!audit.candidates.some((candidate) => candidate.id === candidateId)) return audit;
  const candidates = audit.candidates.map((candidate) => {
    if (candidate.id !== candidateId) return candidate;
    const next = 'decision' in change ? { ...candidate, decision: change.decision } : { ...candidate, goalChoice: change.goal };
    const goal = goalOf(next);
    return { ...next, goal, savingMinor: savingOf(next, goal) };
  });
  return { ...audit, candidates, summary: summaryOf(candidates) };
}

/** «Уже отменено», «Напомнить» or no answer on a subscription to cancel; other goals have none. */
export function applyGoalAnswer(goal: Goal, answer: SubscriptionAnswer): Goal {
  if (goal.kind !== 'cancel' || !goal.subscription) return goal;
  return {
    ...goal,
    subscription: { ...goal.subscription, state: answer, remindOn: answer === 'cancelled' ? null : goal.subscription.remindOn },
  };
}
