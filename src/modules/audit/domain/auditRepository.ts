import { Audit, AuditChanges } from './audit';
import { Goal, GoalDraft, SubscriptionState } from './goal';

export type NewAudit = Pick<Audit, 'id' | 'userId' | 'month' | 'items'>;

export interface AuditRepository {
  /**
   * Keeps the audit unless the user already has one of that month (unique user + month), and returns the one kept:
   * two first reads at once open one audit.
   */
  createIfAbsent(audit: NewAudit): Promise<Audit>;
  findById(id: string): Promise<Audit | null>;
  /** All of the user's audits, newest month first. */
  findByUserId(userId: string): Promise<Audit[]>;
  /**
   * Writes the candidates, the audit day and whether the candidates are frozen if the audit is still at `version`, and
   * moves the version on; false when another write came first (the caller reads it again).
   */
  updateIfVersion(id: string, version: number, changes: AuditChanges): Promise<boolean>;
}

export type NewGoal = GoalDraft & Pick<Goal, 'id' | 'userId' | 'auditId'>;

export type GoalChanges = Partial<
  Pick<Goal, 'kind' | 'name' | 'monthlyMinor' | 'limitMinor' | 'startsOn' | 'endsOn' | 'lastChargeOn' | 'chargeMonths' | 'remindOn' | 'cancelledOn'>
> & { subscriptionState?: SubscriptionState | null };

export interface GoalRepository {
  /** Keeps the goal unless its audit already has one for that candidate (unique audit + candidate). */
  createIgnoringDuplicate(goal: NewGoal): Promise<void>;
  findById(id: string): Promise<Goal | null>;
  findByAuditId(auditId: string): Promise<Goal[]>;
  findByUserId(userId: string): Promise<Goal[]>;
  update(id: string, changes: GoalChanges): Promise<Goal>;
  delete(id: string): Promise<void>;
}
