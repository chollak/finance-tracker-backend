import { randomUUID } from 'crypto';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError, ConflictError, NotFoundError, ValidationError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { daysInMonth, shiftMonth } from '../../transaction/domain/monthAnalytics';
import {
  Audit,
  AuditChanges,
  AuditDecision,
  AuditItem,
  GoalChoice,
  auditMonthOn,
  isServiceCandidate,
  openAuditItems,
  refoundAuditItems,
  sameAuditItems,
} from '../domain/audit';
import { findAuditCandidates, firstWholeMonth } from '../domain/auditRules';
import { AuditRepository, GoalRepository } from '../domain/auditRepository';
import { AuditSources } from '../domain/auditSources';
import { AuditGoalSync } from './auditGoalSync';
import { AuditReader, AuditView } from './auditViews';

const logger = getLogger(LogCategory.TRANSACTION);

/** How many times a change is read and written again when another write to the audit came first. */
const AUDIT_WRITE_ATTEMPTS = 10;

const failed = (message: string, error: unknown) => {
  logger.error(message, error as Error);
  return ResultHelper.failure(new BusinessLogicError(message));
};

/**
 * «Ревизия сентября» (FT-131): the audit of the month before today, opened the first time it is asked for, with the
 * candidates the rules find (FT-130); undecided ones of the month before come with them, and what was needed or
 * cancelled stays out (`openAuditItems`). Until the first mark or «Готово» every read finds them again, the same
 * spending keeping its id (FT-142: the invitation on the 1st must not cut off yesterday's records); from then on they
 * are kept as they are. Before a month was recorded whole there is no audit: the answer says when the first one opens
 * («Первая ревизия — 1 ноября»).
 */
export class GetCurrentAuditUseCase {
  constructor(private audits: AuditRepository, private goals: GoalRepository, private sources: AuditSources, private reader: AuditReader) {}

  async execute(input: { userId: string; today?: string }): Promise<Result<AuditView>> {
    try {
      const today = this.reader.today(input.today);
      const month = auditMonthOn(today);
      const earlier = await this.audits.findByUserId(input.userId);
      const existing = earlier.find(audit => audit.month === month);
      if (existing?.frozen) return ResultHelper.success(await this.reader.auditView(existing, today));

      const firstRecordDate = await this.sources.firstRecordDate(input.userId);
      if (!existing) {
        const wholeFrom = firstWholeMonth(firstRecordDate);
        if (!firstRecordDate || !wholeFrom || month < wholeFrom) {
          const firstAuditOn = wholeFrom ? `${shiftMonth(wholeFrom, 1)}-01` : null;
          return ResultHelper.success(this.reader.tooEarlyView(today, firstRecordDate, firstAuditOn));
        }
      }

      const items = await this.findItems(input.userId, month, firstRecordDate, earlier);
      const audit = existing
        ? await this.refind(existing, items)
        : await this.audits.createIfAbsent({ id: randomUUID(), userId: input.userId, month, items });
      return ResultHelper.success(await this.reader.auditView(audit, today));
    } catch (error) {
      return failed('Failed to open the audit', error);
    }
  }

  /** The candidates of `month` as the rules find them today, with what the audits before leave in or out. */
  private async findItems(userId: string, month: string, firstRecordDate: string | null, earlier: readonly Audit[]): Promise<AuditItem[]> {
    // Every month up to the audited one: a service's earlier charges tell a new subscription from a yearly one
    const records = firstRecordDate ? (await this.reader.expenses(userId, firstRecordDate, `${month}-${daysInMonth(month)}`)).records : [];
    const found = findAuditCandidates({ month, records, firstRecordDate });
    const cancelled = (await this.goals.findByUserId(userId))
      .filter(goal => goal.serviceKey !== null && goal.subscriptionState === 'cancelled' && goal.cancelledOn !== null)
      .map(goal => ({ serviceKey: goal.serviceKey!, cancelledOn: goal.cancelledOn! }));
    return openAuditItems({ month, found, earlier, cancelled, newId: randomUUID });
  }

  /**
   * Writes the candidates found again over those of an audit not frozen (`refoundAuditItems` keeps their ids), unless
   * they say the same. A mark written first freezes the audit: then it is returned as it is.
   */
  private async refind(existing: Audit, found: AuditItem[]): Promise<Audit> {
    let audit: Audit | null = existing;
    for (let attempt = 0; audit && attempt < AUDIT_WRITE_ATTEMPTS; attempt++) {
      if (audit.frozen) return audit;
      const items = refoundAuditItems(audit.items, found);
      if (sameAuditItems(audit.items, items)) return audit;
      const changes: AuditChanges = { items, doneOn: audit.doneOn, frozen: false };
      if (await this.audits.updateIfVersion(audit.id, audit.version, changes)) return { ...audit, ...changes, version: audit.version + 1 };
      audit = await this.audits.findById(audit.id);
    }
    return audit ?? existing;
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
  change: (audit: Audit) => Result<AuditChanges>
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

const DECISIONS: ReadonlyArray<AuditDecision | null> = ['need', 'extra', null];
const GOAL_CHOICES: readonly GoalChoice[] = ['half', 'drop'];

/**
 * «Нужно / Лишнее» and «Вдвое меньше / Отказаться» of one candidate: `{ decision }` ('need', 'extra' or null — the
 * second press takes the mark back) and/or `{ goal }` ('half' or 'drop', only for a repeating spending that is not a
 * subscription). The first one freezes the audit's candidates (FT-142). Changed after «Готово», the goals follow at once.
 */
export class DecideAuditCandidateUseCase {
  constructor(private audits: AuditRepository, private goalSync: AuditGoalSync, private reader: AuditReader) {}

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
        return ResultHelper.success({ items: audit.items.map(entry => (entry.id === item.id ? next : entry)), doneOn: audit.doneOn, frozen: true });
      });
      if (!changed.success) return changed;
      if (changed.data.doneOn) await this.goalSync.sync(changed.data.id);
      return ResultHelper.success(await this.reader.auditView(changed.data, today));
    } catch (error) {
      return failed('Failed to change the audit', error);
    }
  }
}

/**
 * «Готово» — open after the first mark (an audit with nothing found has nothing to mark). The first one gives the
 * audit its day, from which the goals count, and freezes its candidates; the goals are written from the decisions.
 * Pressed again after «Изменить отметки», it keeps the day.
 */
export class FinishAuditUseCase {
  constructor(private audits: AuditRepository, private goalSync: AuditGoalSync, private reader: AuditReader) {}

  async execute(input: { userId: string; auditId: string; today?: string }): Promise<Result<AuditView>> {
    try {
      const today = this.reader.today(input.today);
      const opened = await openAudit(this.audits, input.userId, input.auditId, today);
      if (!opened.success) return opened;

      const finished = await changeAudit(this.audits, input.auditId, audit => {
        if (audit.items.length > 0 && audit.items.every(item => item.decision === null)) {
          return ResultHelper.failure(new BusinessLogicError('Mark at least one spending first', { reason: 'NOTHING_MARKED' }));
        }
        return ResultHelper.success({ items: audit.items, doneOn: audit.doneOn ?? today, frozen: true });
      });
      if (!finished.success) return finished;
      await this.goalSync.sync(finished.data.id);
      return ResultHelper.success(await this.reader.auditView(finished.data, today));
    } catch (error) {
      return failed('Failed to finish the audit', error);
    }
  }
}
