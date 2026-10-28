import { DataSource, In, LessThan, Repository } from 'typeorm';
import { AppDataSource } from '../../../shared/infrastructure/database/database.config';
import { NotificationLog as NotificationLogEntity } from '../../../shared/infrastructure/database/entities/NotificationLog';
import {
  DailySummaryVariant,
  NotificationAnswer,
  NotificationChanges,
  NotificationClaim,
  NotificationEntry,
  NotificationKind,
  NotificationLogRepository,
  NotificationStatus,
} from '../domain/notificationLog';

const STATUSES: readonly NotificationStatus[] = ['sending', 'not_sent', 'sent', 'skipped', 'failed'];
const VARIANTS: readonly DailySummaryVariant[] = ['summary', 'empty'];
const ANSWERS: readonly NotificationAnswer[] = ['no_spending', 'later'];

function oneOf<T extends string>(values: readonly T[], value: string | null): T | null {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : null;
}

/** Only the fields given: an undefined one is left as it is. */
function given(changes: NotificationChanges): Partial<NotificationLogEntity> {
  return Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
}

export class SqliteNotificationLogRepository implements NotificationLogRepository {
  private repository: Repository<NotificationLogEntity>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(NotificationLogEntity);
  }

  /**
   * `INSERT OR IGNORE` on the unique (user, kind, period) and a read back: the row is this call's only if it
   * carries this call's id. A failed insert caught as an error would roll back other writes on SQLite's one
   * connection (FT-140).
   */
  async claim(input: NotificationClaim): Promise<boolean> {
    await this.repository
      .createQueryBuilder()
      .insert()
      .values({
        id: input.id,
        userId: input.userId,
        kind: input.kind,
        period: input.period,
        status: input.waiting ? 'not_sent' : 'sending',
        attempts: input.waiting ? 0 : 1,
        sendUntil: input.sendUntil,
      })
      .orIgnore()
      .execute();
    const stored = await this.find(input.userId, input.kind, input.period);
    return stored?.id === input.id;
  }

  async find(userId: string, kind: NotificationKind, period: string): Promise<NotificationEntry | null> {
    const entity = await this.repository.findOne({ where: { userId, kind, period } });
    return entity ? this.toDomain(entity) : null;
  }

  async update(id: string, changes: NotificationChanges): Promise<void> {
    const fields = given(changes);
    if (Object.keys(fields).length === 0) return;
    await this.repository.update(id, fields);
  }

  /** `UPDATE … WHERE id = ? AND status = ?`: SQLite runs it whole, so of two ticks only one sees a changed row. */
  async transition(id: string, from: NotificationStatus, changes: NotificationChanges): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(NotificationLogEntity)
      .set(given(changes))
      .where('id = :id', { id })
      .andWhere('status = :from', { from })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async expired(userId: string, kinds: readonly NotificationKind[], today: string): Promise<NotificationEntry[]> {
    const entities = await this.repository.find({
      where: { userId, kind: In([...kinds]), status: 'not_sent', sendUntil: LessThan(today) },
      order: { period: 'ASC' },
    });
    return entities.map(entity => this.toDomain(entity));
  }

  async hasEarlier(userId: string, kind: NotificationKind, period: string): Promise<boolean> {
    return this.repository.exists({ where: { userId, kind, period: LessThan(period) } });
  }

  async lastSent(userId: string, kinds: readonly NotificationKind[], variant: DailySummaryVariant, limit: number): Promise<NotificationEntry[]> {
    const entities = await this.repository.find({
      where: { userId, kind: In([...kinds]), variant, status: 'sent' },
      order: { period: 'DESC' },
      take: limit,
    });
    return entities.map(entity => this.toDomain(entity));
  }

  private toDomain(entity: NotificationLogEntity): NotificationEntry {
    return {
      id: entity.id,
      userId: entity.userId,
      kind: entity.kind as NotificationKind,
      period: entity.period,
      status: oneOf(STATUSES, entity.status) ?? 'sending',
      variant: oneOf(VARIANTS, entity.variant ?? null),
      chatId: entity.chatId ?? null,
      messageId: entity.messageId === null || entity.messageId === undefined ? null : Number(entity.messageId),
      answer: oneOf(ANSWERS, entity.answer ?? null),
      error: entity.error ?? null,
      dueOn: entity.dueOn ?? null,
      attempts: Number(entity.attempts ?? 0),
      sendUntil: entity.sendUntil ?? null,
      createdAt: new Date(entity.createdAt),
      updatedAt: new Date(entity.updatedAt),
    };
  }
}
