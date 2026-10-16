import { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../../../shared/infrastructure/database/database.config';
import { Account as AccountEntity } from '../../../shared/infrastructure/database/entities/Account';
import { Account, isAccountKind, isCurrency } from '../domain/account';
import { AccountRepository } from '../domain/accountRepository';

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

  async create(account: Account): Promise<Account> {
    const saved = await this.repository.save(this.repository.create({ ...account }));
    return this.toDomain(saved);
  }

  async update(
    id: string,
    changes: Partial<Pick<Account, 'name' | 'kind' | 'currency' | 'isHidden' | 'sortOrder'>>
  ): Promise<Account> {
    if (Object.keys(changes).length > 0) await this.repository.update(id, changes);
    const updated = await this.findById(id);
    if (!updated) throw new Error(`Account ${id} not found after update`);
    return updated;
  }

  /**
   * How much each account changed since its opening date (money-model «Остаток счёта»): every record
   * that is not archived counts by its type — whatever its semanticType and even while it awaits review,
   * because the money did leave or reach the account. Records dated before the opening date do not count,
   * nor do records in another currency than the account's — a «55$» parked on a сум account for lack
   * of a dollar account waits for review (FT-103) and counts once it is moved.
   */
  async balanceChanges(userId: string): Promise<Map<string, number>> {
    const rows: Array<{ accountId: string; change: number | string }> = await this.dataSource.query(
      `SELECT t."account_id" AS "accountId",
              SUM(CASE WHEN t."type" = 'income' THEN t."amount_minor" ELSE -t."amount_minor" END) AS "change"
       FROM "transactions" t
       JOIN "accounts" a ON a."id" = t."account_id"
       WHERE a."user_id" = ? AND t."isArchived" = 0 AND t."date" >= a."opening_date" AND t."currency" = a."currency"
       GROUP BY t."account_id"`,
      [userId]
    );
    return new Map(rows.map(row => [row.accountId, Number(row.change)]));
  }

  async hasOperations(accountId: string): Promise<boolean> {
    const rows = await this.dataSource.query(`SELECT 1 FROM "transactions" WHERE "account_id" = ? LIMIT 1`, [accountId]);
    return rows.length > 0;
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
