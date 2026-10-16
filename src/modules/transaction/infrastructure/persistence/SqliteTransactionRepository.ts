import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AppDataSource } from '../../../../shared/infrastructure/database/database.config';
import { Transaction as TransactionEntity, TransactionType } from '../../../../shared/infrastructure/database/entities/Transaction';
import { TransactionRepository } from '../../domain/transactionRepository';
import { Transaction } from '../../domain/transactionEntity';
import { normalizeSemanticType } from '../../domain/transactionSemanticType';
import { normalizeNeedsReview } from '../../domain/transactionEntity';
import { fromMinor, minorOf, toMinor } from '../../../../shared/domain/money/money';
import { isRecordCurrency, isRecordSource } from '../../domain/recordSource';
import { HistoryCursor, HistoryFilters, HistoryPage, recordSearchText } from '../../domain/transactionHistory';

/** «50%» is searched as text: LIKE wildcards in the query are escaped. */
function likeContains(key: string): string {
  return `%${key.replace(/[\\%_]/g, char => `\\${char}`)}%`;
}

/** createdAt as SQLite stores it and as an ISO cursor carries it, compared in one format. */
const CREATED_AT = "strftime('%Y-%m-%d %H:%M:%f', transaction.createdAt)";

export class SqliteTransactionRepository implements TransactionRepository {
  private repository: Repository<TransactionEntity>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(TransactionEntity);
  }

  /**
   * Records come with their category, so readers get its current name. Deleted records (FT-105) are
   * left out unless asked for: every reader — history, balances, analytics, the bot, the weekly
   * review, export, learning — goes through here.
   */
  private query(options: { includeDeleted?: boolean } = {}): SelectQueryBuilder<TransactionEntity> {
    const builder = this.repository.createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.categoryRef', 'category');
    return options.includeDeleted ? builder.where('1 = 1') : builder.where('transaction.deletedAt IS NULL');
  }

  async create(transaction: Transaction): Promise<Transaction> {
    if (!transaction.categoryId) {
      throw new Error('A transaction needs categoryId; resolve the category before creating it (FT-099)');
    }
    if (!transaction.accountId) {
      throw new Error('A transaction needs accountId; resolve the account before creating it (FT-101)');
    }
    const entity = this.repository.create({
      amountMinor: minorOf(transaction),
      type: transaction.type === 'income' ? TransactionType.INCOME : TransactionType.EXPENSE,
      semanticType: normalizeSemanticType(transaction.semanticType, transaction.type),
      needsReview: normalizeNeedsReview(transaction.needsReview),
      description: transaction.description,
      date: transaction.date,
      merchant: transaction.merchant,
      searchText: recordSearchText(transaction),
      confidence: transaction.confidence,
      originalText: transaction.originalText,
      originalParsing: transaction.originalParsing ? JSON.stringify(transaction.originalParsing) : undefined,
      userId: transaction.userId,
      categoryId: transaction.categoryId,
      accountId: transaction.accountId,
      currency: transaction.currency ?? 'UZS',
      source: transaction.source ?? null,
      clientId: transaction.clientId ?? null,
      isArchived: transaction.isArchived ?? false
    });

    const saved = await this.repository.save(entity);
    const stored = await this.findByIdIncludingArchived(saved.id);
    if (!stored) throw new Error(`Transaction ${saved.id} not found after create`);
    return stored;
  }

  async getAll(): Promise<Transaction[]> {
    const entities = await this.query()
      .andWhere('transaction.isArchived = :isArchived', { isArchived: false })
      .orderBy('transaction.createdAt', 'DESC')
      .getMany();

    return entities.map(entity => this.mapToTransaction(entity));
  }

  async findById(id: string): Promise<Transaction | null> {
    const entity = await this.query()
      .andWhere('transaction.id = :id', { id })
      .andWhere('transaction.isArchived = :isArchived', { isArchived: false })
      .getOne();

    return entity ? this.mapToTransaction(entity) : null;
  }

  /** Deletes softly (FT-105); `restore` brings the record back. */
  async delete(id: string): Promise<void> {
    await this.repository.update(id, { deletedAt: new Date() });
  }

  async restore(id: string): Promise<Transaction> {
    await this.repository.update(id, { deletedAt: null });
    const restored = await this.findByIdIncludingArchived(id);
    if (!restored) throw new Error(`Transaction ${id} not found after restore`);
    return restored;
  }

  async findByClientId(userId: string, clientId: string): Promise<Transaction[]> {
    const prefix = `${clientId}:`;
    const entities = await this.query({ includeDeleted: true })
      .andWhere('transaction.userId = :userId', { userId })
      .andWhere('(transaction.clientId = :clientId OR substr(transaction.clientId, 1, :length) = :prefix)', {
        clientId, prefix, length: prefix.length,
      })
      .getMany();
    const index = (record: Transaction) => Number(record.clientId === clientId ? 0 : record.clientId!.slice(prefix.length));
    return entities.map(entity => this.mapToTransaction(entity)).sort((a, b) => index(a) - index(b));
  }

  /**
   * One page of history (FT-107). The query matches the note or merchant (`search_text`) or the
   * category's current name (`name_key`, kept by the category module), so a renamed category is found
   * by its new name at once. Ordered by date, creation time and id, newest first; the cursor is where
   * the previous page ended.
   */
  async findHistory(userId: string, filters: HistoryFilters, cursor: HistoryCursor | null, limit: number): Promise<HistoryPage> {
    const builder = this.query()
      .andWhere('transaction.userId = :userId', { userId })
      .andWhere('transaction.isArchived = :isArchived', { isArchived: false });

    if (filters.q) {
      builder.andWhere("(transaction.searchText LIKE :pattern ESCAPE '\\' OR category.nameKey LIKE :pattern ESCAPE '\\')", {
        pattern: likeContains(filters.q),
      });
    }
    if (filters.categoryIds?.length) builder.andWhere('transaction.categoryId IN (:...categoryIds)', { categoryIds: filters.categoryIds });
    if (filters.accountIds?.length) builder.andWhere('transaction.accountId IN (:...accountIds)', { accountIds: filters.accountIds });
    if (filters.type) {
      builder.andWhere('transaction.type = :type', { type: filters.type === 'income' ? TransactionType.INCOME : TransactionType.EXPENSE });
    }
    if (filters.from) builder.andWhere('transaction.date >= :from', { from: filters.from });
    if (filters.to) builder.andWhere('transaction.date <= :to', { to: filters.to });
    if (cursor) {
      builder.andWhere(
        `(transaction.date < :cursorDate
          OR (transaction.date = :cursorDate AND ${CREATED_AT} < strftime('%Y-%m-%d %H:%M:%f', :cursorCreatedAt))
          OR (transaction.date = :cursorDate AND ${CREATED_AT} = strftime('%Y-%m-%d %H:%M:%f', :cursorCreatedAt) AND transaction.id < :cursorId))`,
        { cursorDate: cursor.date, cursorCreatedAt: cursor.createdAt, cursorId: cursor.id }
      );
    }

    const entities = await builder
      .orderBy('transaction.date', 'DESC')
      .addOrderBy('transaction.createdAt', 'DESC')
      .addOrderBy('transaction.id', 'DESC')
      .limit(limit + 1)
      .getMany();

    const items = entities.slice(0, limit).map(entity => this.mapToTransaction(entity));
    const last = items[items.length - 1];
    const next = entities.length > limit && last
      ? { date: last.date, createdAt: last.createdAt!, id: last.id! }
      : null;
    return { items, next };
  }

  /** A record by id even if it is deleted — to restore it, or to answer a repeated create (FT-106). */
  async findByIdIncludingDeleted(id: string): Promise<Transaction | null> {
    const entity = await this.query({ includeDeleted: true })
      .andWhere('transaction.id = :id', { id })
      .getOne();
    return entity ? this.mapToTransaction(entity) : null;
  }

  async update(id: string, updates: Partial<Transaction>): Promise<Transaction> {
    const updateData: QueryDeepPartialEntity<TransactionEntity> = {};

    if (updates.amountMinor !== undefined) updateData.amountMinor = updates.amountMinor;
    else if (updates.amount !== undefined) updateData.amountMinor = toMinor(updates.amount);
    if (updates.type !== undefined) {
      updateData.type = updates.type === 'income' ? TransactionType.INCOME : TransactionType.EXPENSE;
    }
    if (updates.semanticType !== undefined) {
      updateData.semanticType = normalizeSemanticType(updates.semanticType, updates.type ?? 'expense');
    }
    if (updates.needsReview !== undefined) updateData.needsReview = updates.needsReview;
    if (updates.description !== undefined) updateData.description = updates.description;
    // A category arrives resolved to its id (FT-099); a bare name is not written
    if (updates.categoryId !== undefined) updateData.categoryId = updates.categoryId;
    if (updates.accountId !== undefined) updateData.accountId = updates.accountId;
    if (updates.currency !== undefined) updateData.currency = updates.currency;
    if (updates.date !== undefined) updateData.date = updates.date;
    if (updates.merchant !== undefined) updateData.merchant = updates.merchant;
    if (updates.confidence !== undefined) updateData.confidence = updates.confidence;
    // The search text follows the note and the merchant (FT-107)
    if (updates.description !== undefined || updates.merchant !== undefined) {
      const current = await this.repository.findOne({ where: { id } });
      updateData.searchText = recordSearchText({
        description: updates.description ?? current?.description,
        merchant: updates.merchant ?? current?.merchant,
      });
    }

    if (Object.keys(updateData).length > 0) {
      await this.repository.update(id, updateData);
    }

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Transaction with id ${id} not found after update`);
    }

    return updated;
  }

  async getByUserIdAndDateRange(userId: string, startDate: Date, endDate: Date): Promise<Transaction[]> {
    const entities = await this.query()
      .andWhere('transaction.userId = :userId', { userId })
      .andWhere('transaction.isArchived = :isArchived', { isArchived: false })
      .andWhere('transaction.date >= :startDate', { startDate: startDate.toISOString().split('T')[0] })
      .andWhere('transaction.date <= :endDate', { endDate: endDate.toISOString().split('T')[0] })
      .orderBy('transaction.date', 'DESC')
      .getMany();

    return entities.map(entity => this.mapToTransaction(entity));
  }

  async findByUserId(userId: string, limit?: number): Promise<Transaction[]> {
    const queryBuilder = this.query()
      .andWhere('transaction.userId = :userId', { userId })
      .andWhere('transaction.isArchived = :isArchived', { isArchived: false })
      .orderBy('transaction.date', 'DESC')
      .addOrderBy('transaction.createdAt', 'DESC');

    if (limit) {
      queryBuilder.take(limit);
    }

    const entities = await queryBuilder.getMany();
    return entities.map(entity => this.mapToTransaction(entity));
  }

  private mapToTransaction(entity: TransactionEntity): Transaction {
    return {
      id: entity.id,
      amountMinor: Number(entity.amountMinor),
      amount: fromMinor(Number(entity.amountMinor)),
      type: entity.type === TransactionType.INCOME ? 'income' : 'expense',
      semanticType: normalizeSemanticType(entity.semanticType, entity.type === TransactionType.INCOME ? 'income' : 'expense'),
      needsReview: entity.needsReview ?? false,
      description: entity.description,
      date: entity.date,
      userId: entity.userId,
      merchant: entity.merchant,
      confidence: entity.confidence ? Number(entity.confidence) : undefined,
      originalText: entity.originalText,
      originalParsing: entity.originalParsing ? JSON.parse(entity.originalParsing) : undefined,
      categoryId: entity.categoryId,
      category: entity.categoryRef?.name ?? entity.legacyCategory ?? 'Другое',
      categoryColor: entity.categoryRef?.color,
      accountId: entity.accountId,
      currency: isRecordCurrency(entity.currency) ? entity.currency : 'UZS',
      source: isRecordSource(entity.source) ? entity.source : undefined,
      userName: undefined, // We'll get this from User entity later
      isArchived: entity.isArchived ?? false,
      createdAt: entity.createdAt?.toISOString(),
      // Only deleted records and records sent with a client id carry these, so others keep their shape
      ...(entity.deletedAt ? { deletedAt: new Date(entity.deletedAt).toISOString() } : {}),
      ...(entity.clientId ? { clientId: entity.clientId } : {}),
    };
  }

  // Archive methods
  async archive(id: string): Promise<void> {
    await this.repository.update(id, { isArchived: true });
  }

  async unarchive(id: string): Promise<void> {
    await this.repository.update(id, { isArchived: false });
  }

  async archiveMultiple(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.repository
      .createQueryBuilder()
      .update()
      .set({ isArchived: true })
      .whereInIds(ids)
      .execute();
  }

  async archiveAllByUserId(userId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({ isArchived: true })
      .where('userId = :userId', { userId })
      .andWhere('isArchived = :isArchived', { isArchived: false })
      .execute();
    return result.affected || 0;
  }

  async findArchivedByUserId(userId: string, limit?: number): Promise<Transaction[]> {
    const queryBuilder = this.query()
      .andWhere('transaction.userId = :userId', { userId })
      .andWhere('transaction.isArchived = :isArchived', { isArchived: true })
      .orderBy('transaction.date', 'DESC')
      .addOrderBy('transaction.createdAt', 'DESC');

    if (limit) {
      queryBuilder.take(limit);
    }

    const entities = await queryBuilder.getMany();
    return entities.map(entity => this.mapToTransaction(entity));
  }

  async findByIdIncludingArchived(id: string): Promise<Transaction | null> {
    const entity = await this.query()
      .andWhere('transaction.id = :id', { id })
      .getOne();

    return entity ? this.mapToTransaction(entity) : null;
  }
}
