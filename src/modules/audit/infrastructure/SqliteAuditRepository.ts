import { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../../../shared/infrastructure/database/database.config';
import { Audit as AuditEntity } from '../../../shared/infrastructure/database/entities/Audit';
import { Audit, AuditDecision, AuditItem, GoalChoice } from '../domain/audit';
import { AuditRepository, NewAudit } from '../domain/auditRepository';

export class SqliteAuditRepository implements AuditRepository {
  private repository: Repository<AuditEntity>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(AuditEntity);
  }

  /**
   * `INSERT OR IGNORE` on the unique (user, month) and a read back, as `notifications_log` does: a failed insert caught
   * as an error would roll back other writes on SQLite's one connection (FT-140).
   */
  async createIfAbsent(audit: NewAudit): Promise<Audit> {
    await this.repository
      .createQueryBuilder()
      .insert()
      .values({ id: audit.id, userId: audit.userId, month: audit.month, candidates: JSON.stringify(audit.items), doneOn: null, version: 0 })
      .orIgnore()
      .execute();
    const stored = await this.repository.findOne({ where: { userId: audit.userId, month: audit.month } });
    if (!stored) throw new Error(`Audit of ${audit.month} not found after insert`);
    return this.toDomain(stored);
  }

  async findById(id: string): Promise<Audit | null> {
    const entity = await this.repository.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByUserId(userId: string): Promise<Audit[]> {
    const entities = await this.repository.find({ where: { userId }, order: { month: 'DESC' } });
    return entities.map(entity => this.toDomain(entity));
  }

  async updateIfVersion(id: string, version: number, changes: Pick<Audit, 'items' | 'doneOn'>): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(AuditEntity)
      .set({ candidates: JSON.stringify(changes.items), doneOn: changes.doneOn, version: () => '"version" + 1' })
      .where('id = :id', { id })
      .andWhere('version = :version', { version })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  private toDomain(entity: AuditEntity): Audit {
    return {
      id: entity.id,
      userId: entity.userId,
      month: entity.month,
      items: parseItems(entity.candidates),
      doneOn: entity.doneOn ?? null,
      version: Number(entity.version),
      createdAt: new Date(entity.createdAt),
      updatedAt: new Date(entity.updatedAt),
    };
  }
}

const DECISIONS: readonly AuditDecision[] = ['need', 'extra'];
const GOAL_CHOICES: readonly GoalChoice[] = ['half', 'drop'];

/** The kept candidates; an entry that is not one is left out, a decision written wrong reads as none. */
function parseItems(value: string): AuditItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((entry): entry is AuditItem => Boolean(entry) && typeof entry === 'object'
      && typeof entry.id === 'string' && typeof entry.name === 'string' && typeof entry.categoryId === 'string'
      && Number.isInteger(entry.amountMinor) && Array.isArray(entry.operations))
    .map(entry => ({
      ...entry,
      carriedFrom: typeof entry.carriedFrom === 'string' ? entry.carriedFrom : null,
      decision: DECISIONS.includes(entry.decision as AuditDecision) ? entry.decision : null,
      goalChoice: GOAL_CHOICES.includes(entry.goalChoice as GoalChoice) ? entry.goalChoice : null,
    }));
}
