import { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../../../shared/infrastructure/database/database.config';
import { NotificationLog as NotificationLogEntity } from '../../../shared/infrastructure/database/entities/NotificationLog';
import {
  DailySummaryVariant,
  NotificationAnswer,
  NotificationChanges,
  NotificationEntry,
  NotificationKind,
  NotificationLogRepository,
  NotificationStatus,
} from '../domain/notificationLog';

const STATUSES: readonly NotificationStatus[] = ['sending', 'sent', 'skipped', 'failed'];
const VARIANTS: readonly DailySummaryVariant[] = ['summary', 'empty'];
const ANSWERS: readonly NotificationAnswer[] = ['no_spending'];

function oneOf<T extends string>(values: readonly T[], value: string | null): T | null {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : null;
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
  async claim(input: { id: string; userId: string; kind: NotificationKind; period: string }): Promise<boolean> {
    await this.repository
      .createQueryBuilder()
      .insert()
      .values({ id: input.id, userId: input.userId, kind: input.kind, period: input.period, status: 'sending' })
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
    const fields = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    if (Object.keys(fields).length === 0) return;
    await this.repository.update(id, fields);
  }

  async lastSent(userId: string, kind: NotificationKind, variant: DailySummaryVariant, limit: number): Promise<NotificationEntry[]> {
    const entities = await this.repository.find({ where: { userId, kind, variant, status: 'sent' }, order: { period: 'DESC' }, take: limit });
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
      createdAt: new Date(entity.createdAt),
      updatedAt: new Date(entity.updatedAt),
    };
  }
}
