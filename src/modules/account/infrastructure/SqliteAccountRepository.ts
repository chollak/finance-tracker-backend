import { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../../../shared/infrastructure/database/database.config';
import { Account as AccountEntity } from '../../../shared/infrastructure/database/entities/Account';
import { Account, isAccountKind, isCurrency } from '../domain/account';
import { AccountChanges, AccountRepository } from '../domain/accountRepository';

export class SqliteAccountRepository implements AccountRepository {
  private repository: Repository<AccountEntity>;

  constructor(private dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(AccountEntity);
  }

  async findByUserId(userId: string): Promise<Account[]> {
    const entities = await this.repository.find({ where: { userId }, order: { sortOrder: 'ASC', createdAt: 'ASC' } });
    return entities.map(entity => this.toDomain(entity));
  }

  async findById(id: string): Promise<Account | null> {
    const entity = await this.repository.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  /** Inserts, never overwrites: a second create with the same id fails on the key. */
  async create(account: Account): Promise<Account> {
    await this.repository.insert(this.repository.create({ ...account }));
    const created = await this.findById(account.id);
    if (!created) throw new Error(`Account ${account.id} not found after create`);
    return created;
  }

  async update(id: string, changes: AccountChanges): Promise<Account> {
    if (Object.keys(changes).length > 0) await this.repository.update(id, changes);
    const updated = await this.findById(id);
    if (!updated) throw new Error(`Account ${id} not found after update`);
    return updated;
  }

  /**
   * How much each account changed since its opening date (money-model «Остаток счёта»): every record
   * that is not archived or deleted (FT-105) counts by its type — whatever its semanticType and even while it awaits review,
   * because the money did leave or reach the account — and every move that is not deleted (FT-104):
   * what arrived adds, what left subtracts, an adjustment adds its signed difference. Records and moves
   * dated before the opening date do not count, nor do records in another currency than the account's —
   * a «55$» parked on a сум account for lack of a dollar account waits for review (FT-103) and counts
   * once it is moved.
   */
  async balanceChanges(userId: string): Promise<Map<string, number>> {
    const rows: Array<{ accountId: string; change: number | string }> = await this.dataSource.query(
      `SELECT "accountId", SUM("change") AS "change" FROM (
         SELECT t."account_id" AS "accountId",
                CASE WHEN t."type" = 'income' THEN t."amount_minor" ELSE -t."amount_minor" END AS "change"
         FROM "transactions" t
         JOIN "accounts" a ON a."id" = t."account_id"
         WHERE a."user_id" = ? AND t."isArchived" = 0 AND t."deleted_at" IS NULL
           AND t."date" >= a."opening_date" AND t."currency" = a."currency"
         UNION ALL
         SELECT m."to_account_id", m."to_amount_minor"
         FROM "account_moves" m
         JOIN "accounts" a ON a."id" = m."to_account_id"
         WHERE a."user_id" = ? AND m."deleted_at" IS NULL AND m."date" >= a."opening_date"
         UNION ALL
         SELECT m."from_account_id", -m."from_amount_minor"
         FROM "account_moves" m
         JOIN "accounts" a ON a."id" = m."from_account_id"
         WHERE a."user_id" = ? AND m."deleted_at" IS NULL AND m."date" >= a."opening_date"
       ) GROUP BY "accountId"`,
      [userId, userId, userId]
    );
    return new Map(rows.map(row => [row.accountId, Number(row.change)]));
  }

  /** Deleted records and moves count too: «Отменить» can bring them back. */
  async hasOperations(accountId: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM "transactions" WHERE "account_id" = ?
       UNION ALL
       SELECT 1 FROM "account_moves" WHERE "from_account_id" = ? OR "to_account_id" = ?
       LIMIT 1`,
      [accountId, accountId, accountId]
    );
    return rows.length > 0;
  }

  /** The check and the delete are one statement, so a record written in between keeps its account. */
  async deleteIfUnused(accountId: string): Promise<boolean> {
    await this.dataSource.query(
      `DELETE FROM "accounts" WHERE "id" = ?
         AND NOT EXISTS (SELECT 1 FROM "transactions" WHERE "account_id" = ?)
         AND NOT EXISTS (SELECT 1 FROM "account_moves" WHERE "from_account_id" = ? OR "to_account_id" = ?)`,
      [accountId, accountId, accountId, accountId]
    );
    return (await this.findById(accountId)) === null;
  }

  private toDomain(entity: AccountEntity): Account {
    return {
      id: entity.id,
      userId: entity.userId,
      name: entity.name,
      kind: isAccountKind(entity.kind) ? entity.kind : 'card',
      currency: isCurrency(entity.currency) ? entity.currency : 'UZS',
      openingBalanceMinor: Number(entity.openingBalanceMinor ?? 0),
      openingDate: entity.openingDate,
      isHidden: Boolean(entity.isHidden),
      sortOrder: Number(entity.sortOrder),
    };
  }
}
