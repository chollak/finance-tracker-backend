import { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../../../shared/infrastructure/database/database.config';
import { Goal as GoalEntity } from '../../../shared/infrastructure/database/entities/Goal';
import { GoalKind } from '../domain/audit';
import { Goal, SubscriptionState } from '../domain/goal';
import { GoalChanges, GoalRepository, NewGoal } from '../domain/auditRepository';

const KINDS: readonly GoalKind[] = ['half', 'drop', 'cancel'];
const STATES: readonly SubscriptionState[] = ['cancelled', 'remind'];

export class SqliteGoalRepository implements GoalRepository {
  private repository: Repository<GoalEntity>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(GoalEntity);
  }

  /** `INSERT OR IGNORE` on the unique (audit, candidate): two «Готово» at once write one goal. */
  async createIgnoringDuplicate(goal: NewGoal): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .insert()
      .values({ ...goal, subscriptionState: null, remindOn: null, cancelledOn: null })
      .orIgnore()
      .execute();
  }

  async findById(id: string): Promise<Goal | null> {
    const entity = await this.repository.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByAuditId(auditId: string): Promise<Goal[]> {
    return (await this.repository.find({ where: { auditId } })).map(entity => this.toDomain(entity));
  }

  async findByUserId(userId: string): Promise<Goal[]> {
    return (await this.repository.find({ where: { userId } })).map(entity => this.toDomain(entity));
  }

  async update(id: string, changes: GoalChanges): Promise<Goal> {
    const fields = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    if (Object.keys(fields).length > 0) await this.repository.update(id, fields);
    const updated = await this.findById(id);
    if (!updated) throw new Error(`Goal ${id} not found after update`);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  private toDomain(entity: GoalEntity): Goal {
    return {
      id: entity.id,
      userId: entity.userId,
      auditId: entity.auditId,
      candidateId: entity.candidateId,
      kind: KINDS.includes(entity.kind as GoalKind) ? (entity.kind as GoalKind) : 'half',
      name: entity.name,
      categoryId: entity.categoryId,
      noteKey: entity.noteKey ?? null,
      serviceKey: entity.serviceKey ?? null,
      monthlyMinor: Number(entity.monthlyMinor),
      limitMinor: Number(entity.limitMinor),
      startsOn: entity.startsOn,
      endsOn: entity.endsOn,
      lastChargeOn: entity.lastChargeOn ?? null,
      chargeMonths: entity.chargeMonths === null || entity.chargeMonths === undefined ? null : Number(entity.chargeMonths),
      subscriptionState: STATES.includes(entity.subscriptionState as SubscriptionState) ? (entity.subscriptionState as SubscriptionState) : null,
      remindOn: entity.remindOn ?? null,
      cancelledOn: entity.cancelledOn ?? null,
      createdAt: new Date(entity.createdAt),
      updatedAt: new Date(entity.updatedAt),
    };
  }
}
