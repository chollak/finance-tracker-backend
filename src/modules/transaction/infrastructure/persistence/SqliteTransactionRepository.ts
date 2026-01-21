import { Repository } from 'typeorm';
import { AppDataSource } from '../../../../shared/infrastructure/database/database.config';
import { Transaction as TransactionEntity, TransactionType } from '../../../../shared/infrastructure/database/entities/Transaction';
import { TransactionRepository } from '../../domain/transactionRepository';
import { Transaction } from '../../domain/transactionEntity';

export class SqliteTransactionRepository implements TransactionRepository {
  private repository: Repository<TransactionEntity>;

  constructor() {
    this.repository = AppDataSource.getRepository(TransactionEntity);
  }

  async save(transaction: Transaction): Promise<string> {
    const entity = this.repository.create({
      amount: transaction.amount,
      type: transaction.type === 'income' ? TransactionType.INCOME : TransactionType.EXPENSE,
      description: transaction.description,
      date: transaction.date,
      merchant: transaction.merchant,
      confidence: transaction.confidence,
      originalText: transaction.originalText,
      originalParsing: transaction.originalParsing ? JSON.stringify(transaction.originalParsing) : undefined,
      userId: transaction.userId,
      category: transaction.category || 'Другое',
      isArchived: transaction.isArchived ?? false
    });

    const saved = await this.repository.save(entity);
    return saved.id;
  }

  async getAll(): Promise<Transaction[]> {
    const entities = await this.repository.find({
      where: { isArchived: false },
      order: { createdAt: 'DESC' }
    });

    return entities.map(entity => this.mapToTransaction(entity));
  }

  async findById(id: string): Promise<Transaction | null> {
    const entity = await this.repository.findOne({
      where: { id, isArchived: false }
    });

    if (!entity) return null;
    return this.mapToTransaction(entity);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async update(id: string, updates: Partial<Transaction>): Promise<Transaction> {
    const updateData: any = {};
    
    if (updates.amount !== undefined) updateData.amount = updates.amount;
    if (updates.type !== undefined) {
      updateData.type = updates.type === 'income' ? TransactionType.INCOME : TransactionType.EXPENSE;
    }
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.date !== undefined) updateData.date = updates.date;
    if (updates.merchant !== undefined) updateData.merchant = updates.merchant;
    if (updates.confidence !== undefined) updateData.confidence = updates.confidence;

    await this.repository.update(id, updateData);
    
    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Transaction with id ${id} not found after update`);
    }
    
    return updated;
  }

  async getByUserIdAndDateRange(userId: string, startDate: Date, endDate: Date): Promise<Transaction[]> {
    const entities = await this.repository.createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.isArchived = :isArchived', { isArchived: false })
      .andWhere('transaction.date >= :startDate', { startDate: startDate.toISOString().split('T')[0] })
      .andWhere('transaction.date <= :endDate', { endDate: endDate.toISOString().split('T')[0] })
      .orderBy('transaction.date', 'DESC')
      .getMany();

    return entities.map(entity => this.mapToTransaction(entity));
  }

  // Additional methods for SQLite-specific functionality
  async findByUserId(userId: string, limit?: number): Promise<Transaction[]> {
    const queryBuilder = this.repository.createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.isArchived = :isArchived', { isArchived: false })
      .orderBy('transaction.date', 'DESC')
      .addOrderBy('transaction.createdAt', 'DESC');

    if (limit) {
      queryBuilder.limit(limit);
    }

    const entities = await queryBuilder.getMany();
    return entities.map(entity => this.mapToTransaction(entity));
  }

  private mapToTransaction(entity: TransactionEntity): Transaction {
    return {
      id: entity.id,
      amount: Number(entity.amount),
      type: entity.type === TransactionType.INCOME ? 'income' : 'expense',
      description: entity.description,
      date: entity.date,
      userId: entity.userId,
      merchant: entity.merchant,
      confidence: entity.confidence ? Number(entity.confidence) : undefined,
      originalText: entity.originalText,
      originalParsing: entity.originalParsing ? JSON.parse(entity.originalParsing) : undefined,
      category: entity.category || 'Другое',
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
    const queryBuilder = this.repository.createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.isArchived = :isArchived', { isArchived: true })
      .orderBy('transaction.date', 'DESC')
      .addOrderBy('transaction.createdAt', 'DESC');

    if (limit) {
      queryBuilder.limit(limit);
    }

    const entities = await queryBuilder.getMany();
    return entities.map(entity => this.mapToTransaction(entity));
  }

  async findByIdIncludingArchived(id: string): Promise<Transaction | null> {
    const entity = await this.repository.findOne({
      where: { id }
    });

    if (!entity) return null;
    return this.mapToTransaction(entity);
  }
}