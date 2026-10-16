import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AppDataSource } from '../../../../shared/infrastructure/database/database.config';
import { Transaction as TransactionEntity, TransactionType } from '../../../../shared/infrastructure/database/entities/Transaction';
import { TransactionRepository } from '../../domain/transactionRepository';
import { Transaction } from '../../domain/transactionEntity';
import { normalizeSemanticType } from '../../domain/transactionSemanticType';
import { normalizeNeedsReview } from '../../domain/transactionEntity';
import { fromMinor, minorOf, toMinor } from '../../../../shared/domain/money/money';

export class SqliteTransactionRepository implements TransactionRepository {
  private repository: Repository<TransactionEntity>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(TransactionEntity);
  }

  /** Records come with their category, so readers get its current name. */
  private query(): SelectQueryBuilder<TransactionEntity> {
    return this.repository.createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.categoryRef', 'category');
  }

  async create(transaction: Transaction): Promise<Transaction> {
    if (!transaction.categoryId) {
      throw new Error('A transaction needs categoryId; resolve the category before creating it (FT-099)');
    }
    const entity = this.repository.create({
      amountMinor: minorOf(transaction),
      type: transaction.type === 'income' ? TransactionType.INCOME : TransactionType.EXPENSE,
      semanticType: normalizeSemanticType(transaction.semanticType, transaction.type),
      needsReview: normalizeNeedsReview(transaction.needsReview),
      description: transaction.description,
      date: transaction.date,
      merchant: transaction.merchant,
      confidence: transaction.confidence,
      originalText: transaction.originalText,
      originalParsing: transaction.originalParsing ? JSON.stringify(transaction.originalParsing) : undefined,
      userId: transaction.userId,
      categoryId: transaction.categoryId,
      isArchived: transaction.isArchived ?? false
    });

    const saved = await this.repository.save(entity);
    const stored = await this.findByIdIncludingArchived(saved.id);
    if (!stored) throw new Error(`Transaction ${saved.id} not found after create`);
    return stored;
  }

  async getAll(): Promise<Transaction[]> {
    const entities = await this.query()
      .where('transaction.isArchived = :isArchived', { isArchived: false })
      .orderBy('transaction.createdAt', 'DESC')
      .getMany();

    return entities.map(entity => this.mapToTransaction(entity));
  }

  async findById(id: string): Promise<Transaction | null> {
    const entity = await this.query()
      .where('transaction.id = :id', { id })
      .andWhere('transaction.isArchived = :isArchived', { isArchived: false })
      .getOne();

    return entity ? this.mapToTransaction(entity) : null;
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
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
    if (updates.date !== undefined) updateData.date = updates.date;
    if (updates.merchant !== undefined) updateData.merchant = updates.merchant;
    if (updates.confidence !== undefined) updateData.confidence = updates.confidence;

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
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.isArchived = :isArchived', { isArchived: false })
      .andWhere('transaction.date >= :startDate', { startDate: startDate.toISOString().split('T')[0] })
      .andWhere('transaction.date <= :endDate', { endDate: endDate.toISOString().split('T')[0] })
      .orderBy('transaction.date', 'DESC')
      .getMany();

    return entities.map(entity => this.mapToTransaction(entity));
  }

  async findByUserId(userId: string, limit?: number): Promise<Transaction[]> {
    const queryBuilder = this.query()
      .where('transaction.userId = :userId', { userId })
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
      userName: undefined, // We'll get this from User entity later
      isArchived: entity.isArchived ?? false,
      createdAt: entity.createdAt?.toISOString()
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
      .where('transaction.userId = :userId', { userId })
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
      .where('transaction.id = :id', { id })
      .getOne();

    return entity ? this.mapToTransaction(entity) : null;
  }
}
