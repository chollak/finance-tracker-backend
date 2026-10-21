import { randomUUID } from 'crypto';
import { AuditRepository, GoalRepository } from '../domain/auditRepository';
import { GoalDraft, goalDraftOf } from '../domain/goal';

/**
 * The goals of a finished audit follow its decisions (FT-131): a goal for each extra repeating spending
 * (`goalDraftOf`), counting from the audit day; a changed choice changes the goal (a subscription keeps its answer), a
 * taken back mark removes it.
 *
 * Every change of the audit asks for a sync after its write. The syncs of one audit run one after another, and each
 * reads the audit as it is when it starts, so the last one leaves the goals of the last decisions. A goal is written
 * only after the decision is read again (FT-142): a spending marked «Нужно» while the sync was running gets no goal.
 */
export class AuditGoalSync {
  private queues = new Map<string, Promise<void>>();

  constructor(private audits: AuditRepository, private goals: GoalRepository) {}

  /** Brings the audit's goals in line with its decisions, after the syncs of the same audit asked for before. */
  sync(auditId: string): Promise<void> {
    const before = this.queues.get(auditId) ?? Promise.resolve();
    const run = before.then(() => this.reconcile(auditId));
    const settled = run.catch(() => undefined);
    this.queues.set(auditId, settled);
    void settled.then(() => {
      if (this.queues.get(auditId) === settled) this.queues.delete(auditId);
    });
    return run;
  }

  private async reconcile(auditId: string): Promise<void> {
    const audit = await this.audits.findById(auditId);
    if (!audit?.doneOn) return;
    const existing = await this.goals.findByAuditId(audit.id);
    const kept = new Set<string>();
    for (const item of audit.items) {
      const draft = goalDraftOf(item, audit.doneOn);
      if (!draft) continue;
      kept.add(item.id);
      const goal = existing.find(entry => entry.candidateId === item.id);
      if (!goal) {
        const latest = await this.draftNow(auditId, item.id);
        if (latest) await this.goals.createIgnoringDuplicate({ ...latest, id: randomUUID(), userId: audit.userId, auditId: audit.id });
      } else if (goal.kind !== draft.kind || goal.limitMinor !== draft.limitMinor || goal.startsOn !== draft.startsOn) {
        await this.goals.update(goal.id, { kind: draft.kind, limitMinor: draft.limitMinor, startsOn: draft.startsOn, endsOn: draft.endsOn });
      }
    }
    for (const goal of existing) if (!kept.has(goal.candidateId)) await this.goals.delete(goal.id);
  }

  /** The goal the candidate makes by the audit as stored right now, or null — read again just before a goal is written. */
  private async draftNow(auditId: string, candidateId: string): Promise<GoalDraft | null> {
    const audit = await this.audits.findById(auditId);
    const item = audit?.items.find(entry => entry.id === candidateId);
    return audit?.doneOn && item ? goalDraftOf(item, audit.doneOn) : null;
  }
}
