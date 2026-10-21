import { randomUUID } from 'crypto';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError, ConflictError, NotFoundError, ValidationError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { daysInMonth, shiftMonth } from '../../transaction/domain/monthAnalytics';
import { Audit, AuditDecision, AuditItem, GoalChoice, auditMonthOn, isServiceCandidate, openAuditItems } from '../domain/audit';
import { findAuditCandidates, firstWholeMonth } from '../domain/auditRules';
import { AuditRepository, GoalRepository } from '../domain/auditRepository';
import { AuditSources } from '../domain/auditSources';
import { goalDraftOf } from '../domain/goal';
import { AuditReader, AuditView } from './auditViews';

const logger = getLogger(LogCategory.TRANSACTION);

/** How many times a change is read and written again when another write to the audit came first. */
const AUDIT_WRITE_ATTEMPTS = 10;

const failed = (message: string, error: unknown) => {
  logger.error(message, error as Error);
  return ResultHelper.failure(new BusinessLogicError(message));
};

/**
 * «Ревизия сентября» (FT-131): the audit of the month before today, opened the first time it is asked for — the
 * candidates are found then (FT-130) and kept as found; undecided ones of the month before come with them, and what
 * was needed or cancelled stays out (`openAuditItems`). Before a month was recorded whole there is no audit: the
 * answer says when the first one opens («Первая ревизия — 1 ноября»).
 */
export class GetCurrentAuditUseCase {
  constructor(private audits: AuditRepository, private goals: GoalRepository, private sources: AuditSources, private reader: AuditReader) {}

  async execute(input: { userId: string; today?: string }): Promise<Result<AuditView>> {
    try {
      const today = this.reader.today(input.today);
      const month = auditMonthOn(today);
      const earlier = await this.audits.findByUserId(input.userId);
      const existing = earlier.find(audit => audit.month === month);
      if (existing) return ResultHelper.success(await this.reader.auditView(existing, today));

      const firstRecordDate = await this.sources.firstRecordDate(input.userId);
      const wholeFrom = firstWholeMonth(firstRecordDate);
      if (!firstRecordDate || !wholeFrom || month < wholeFrom) {
        const firstAuditOn = wholeFrom ? `${shiftMonth(wholeFrom, 1)}-01` : null;
        return ResultHelper.success(this.reader.tooEarlyView(today, firstRecordDate, firstAuditOn));
      }

      // Every month up to the audited one: a service's earlier charges tell a new subscription from a yearly one
      const { records } = await this.reader.expenses(input.userId, firstRecordDate, `${month}-${daysInMonth(month)}`);
      const found = findAuditCandidates({ month, records, firstRecordDate });
      const cancelled = (await this.goals.findByUserId(input.userId))
        .filter(goal => goal.serviceKey !== null && goal.subscriptionState === 'cancelled' && goal.cancelledOn !== null)
        .map(goal => ({ serviceKey: goal.serviceKey!, cancelledOn: goal.cancelledOn! }));
      const items = openAuditItems({ month, found, earlier, cancelled, newId: randomUUID });
      const audit = await this.audits.createIfAbsent({ id: randomUUID(), userId: input.userId, month, items });
      return ResultHelper.success(await this.reader.auditView(audit, today));
    } catch (error) {
      return failed('Failed to open the audit', error);
    }
  }
}

/** The audit asked for, if it is the user's and still the one being held (its month is the month before today). */
async function openAudit(audits: AuditRepository, userId: string, auditId: string, today: string): Promise<Result<Audit>> {
  const audit = await audits.findById(auditId);
  if (!audit || audit.userId !== userId) return ResultHelper.failure(new NotFoundError('Audit', auditId));
  if (audit.month !== auditMonthOn(today)) {
    return ResultHelper.failure(new ConflictError(`The audit of ${audit.month} is closed`, { reason: 'AUDIT_CLOSED' }));
  }
  return ResultHelper.success(audit);
}

/** Applies a change to the audit as it is now; read again and repeated when another write came first. */
async function changeAudit(
  audits: AuditRepository,
  auditId: string,
  change: (audit: Audit) => Result<Pick<Audit, 'items' | 'doneOn'>>
): Promise<Result<Audit>> {
  for (let attempt = 0; attempt < AUDIT_WRITE_ATTEMPTS; attempt++) {
    const audit = await audits.findById(auditId);
    if (!audit) return ResultHelper.failure(new NotFoundError('Audit', auditId));
    const changed = change(audit);
    if (!changed.success) return changed;
    if (await audits.updateIfVersion(audit.id, audit.version, changed.data)) {
      return ResultHelper.success({ ...audit, ...changed.data, version: audit.version + 1 });
    }
  }
  return ResultHelper.failure(new ConflictError('The audit is being changed, try again', { reason: 'AUDIT_BUSY' }));
}

/**
 * The goals of a finished audit follow its decisions: a goal for each extra repeating spending (`goalDraftOf`),
 * counting from the audit day; a changed choice changes the goal (a subscription keeps its answer), a taken back mark
 * removes it. Reads the audit as it is now, so the last of two changes at once wins.
 */
async function syncGoals(audits: AuditRepository, goals: GoalRepository, auditId: string): Promise<void> {
  const audit = await audits.findById(auditId);
  if (!audit?.doneOn) return;
  const existing = await goals.findByAuditId(audit.id);
  const kept = new Set<string>();
  for (const item of audit.items) {
    const draft = goalDraftOf(item, audit.doneOn);
    if (!draft) continue;
    kept.add(item.id);
    const goal = existing.find(entry => entry.candidateId === item.id);
    if (!goal) {
      await goals.createIgnoringDuplicate({ ...draft, id: randomUUID(), userId: audit.userId, auditId: audit.id });
    } else if (goal.kind !== draft.kind || goal.limitMinor !== draft.limitMinor || goal.startsOn !== draft.startsOn) {
      await goals.update(goal.id, { kind: draft.kind, limitMinor: draft.limitMinor, startsOn: draft.startsOn, endsOn: draft.endsOn });
    }
  }
  for (const goal of existing) if (!kept.has(goal.candidateId)) await goals.delete(goal.id);
}

const DECISIONS: ReadonlyArray<AuditDecision | null> = ['need', 'extra', null];
const GOAL_CHOICES: readonly GoalChoice[] = ['half', 'drop'];

/**
 * «Нужно / Лишнее» and «Вдвое меньше / Отказаться» of one candidate: `{ decision }` ('need', 'extra' or null — the
 * second press takes the mark back) and/or `{ goal }` ('half' or 'drop', only for a repeating spending that is not a
 * subscription). Changed after «Готово», the goals follow at once.
 */
export class DecideAuditCandidateUseCase {
  constructor(private audits: AuditRepository, private goals: GoalRepository, private reader: AuditReader) {}

  async execute(input: { userId: string; auditId: string; candidateId: string; body: Record<string, unknown>; today?: string }): Promise<Result<AuditView>> {
    const { body } = input;
    const hasDecision = Object.prototype.hasOwnProperty.call(body, 'decision');
    const hasGoal = Object.prototype.hasOwnProperty.call(body, 'goal');
    if (!hasDecision && !hasGoal) return ResultHelper.failure(new ValidationError('decision or goal is required', 'decision'));
    if (hasDecision && !DECISIONS.includes(body.decision as AuditDecision | null)) {
      return ResultHelper.failure(new ValidationError('decision must be need, extra or null', 'decision'));
    }
    if (hasGoal && !GOAL_CHOICES.includes(body.goal as GoalChoice)) {
      return ResultHelper.failure(new ValidationError('goal must be half or drop', 'goal'));
    }

    try {
      const today = this.reader.today(input.today);
      const opened = await openAudit(this.audits, input.userId, input.auditId, today);
      if (!opened.success) return opened;

      const changed = await changeAudit(this.audits, input.auditId, audit => {
        const item = audit.items.find(entry => entry.id === input.candidateId);
        if (!item) return ResultHelper.failure(new NotFoundError('Audit candidate', input.candidateId));
        if (hasGoal && (!item.recurring || isServiceCandidate(item))) {
          return ResultHelper.failure(new BusinessLogicError('Only a repeating spending that is not a subscription takes «Вдвое меньше» or «Отказаться»', { reason: 'NO_GOAL_CHOICE' }));
        }
        const next: AuditItem = {
          ...item,
          ...(hasDecision ? { decision: body.decision as AuditDecision | null } : {}),
          ...(hasGoal ? { goalChoice: body.goal as GoalChoice } : {}),
        };
        return ResultHelper.success({ items: audit.items.map(entry => (entry.id === item.id ? next : entry)), doneOn: audit.doneOn });
      });
      if (!changed.success) return changed;
      if (changed.data.doneOn) await syncGoals(this.audits, this.goals, changed.data.id);
      return ResultHelper.success(await this.reader.auditView(changed.data, today));
    } catch (error) {
      return failed('Failed to change the audit', error);
    }
  }
}

/**
 * «Готово» — open after the first mark (an audit with nothing found has nothing to mark). The first one gives the
 * audit its day, from which the goals count; the goals are written from the decisions. Pressed again after
 * «Изменить отметки», it keeps the day.
 */
export class FinishAuditUseCase {
  constructor(private audits: AuditRepository, private goals: GoalRepository, private reader: AuditReader) {}

  async execute(input: { userId: string; auditId: string; today?: string }): Promise<Result<AuditView>> {
    try {
      const today = this.reader.today(input.today);
      const opened = await openAudit(this.audits, input.userId, input.auditId, today);
      if (!opened.success) return opened;

      const finished = await changeAudit(this.audits, input.auditId, audit => {
        if (audit.items.length > 0 && audit.items.every(item => item.decision === null)) {
          return ResultHelper.failure(new BusinessLogicError('Mark at least one spending first', { reason: 'NOTHING_MARKED' }));
        }
        return ResultHelper.success({ items: audit.items, doneOn: audit.doneOn ?? today });
      });
      if (!finished.success) return finished;
      await syncGoals(this.audits, this.goals, finished.data.id);
      return ResultHelper.success(await this.reader.auditView(finished.data, today));
    } catch (error) {
      return failed('Failed to finish the audit', error);
    }
  }
}
