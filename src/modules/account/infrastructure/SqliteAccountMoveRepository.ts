import { DataSource, IsNull, Repository } from 'typeorm';
import { AppDataSource } from '../../../shared/infrastructure/database/database.config';
import { AccountMove as AccountMoveEntity } from '../../../shared/infrastructure/database/entities/AccountMove';
import { AccountMove, isMoveKind } from '../domain/accountMove';
import { AccountMoveRepository } from '../domain/accountMoveRepository';

export class SqliteAccountMoveRepository implements AccountMoveRepository {
  private repository: Repository<AccountMoveEntity>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(AccountMoveEntity);
  }

  /** Keeps the given `createdAt` to the millisecond: it orders the operations of a day. */
  async create(move: AccountMove): Promise<AccountMove> {
    const saved = await this.repository.save(this.repository.create(move));
    return this.toDomain((await this.repository.findOne({ where: { id: saved.id } }))!);
  }

  async findById(id: string): Promise<AccountMove | null> {
    const entity = await this.repository.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByAccount(accountId: string): Promise<AccountMove[]> {
    const entities = await this.repository.find({
      where: [
        { fromAccountId: accountId, deletedAt: IsNull() },
        { toAccountId: accountId, deletedAt: IsNull() },
      ],
      order: { date: 'DESC', createdAt: 'DESC' },
    });
    return entities.map(entity => this.toDomain(entity));
  }

  async setDeletedAt(id: string, deletedAt: Date | null): Promise<AccountMove> {
    await this.repository.update(id, { deletedAt });
    const updated = await this.findById(id);
    if (!updated) throw new Error(`Move ${id} not found after update`);
    return updated;
  }

  private toDomain(entity: AccountMoveEntity): AccountMove {
    return {
      id: entity.id,
      userId: entity.userId,
      kind: isMoveKind(entity.kind) ? entity.kind : 'transfer',
      fromAccountId: entity.fromAccountId ?? null,
      toAccountId: entity.toAccountId,
      fromAmountMinor: entity.fromAmountMinor ?? null,
      toAmountMinor: Number(entity.toAmountMinor),
      dealRateMinor: entity.dealRateMinor ?? null,
      cbuRateMinor: entity.cbuRateMinor ?? null,
      date: entity.date,
      note: entity.note ?? null,
      createdAt: new Date(entity.createdAt),
      deletedAt: entity.deletedAt ? new Date(entity.deletedAt) : null,
    };
  }
}
