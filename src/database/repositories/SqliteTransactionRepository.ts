import { Repository } from 'typeorm';
import { AppDataSource } from '../database.config';
import { Transaction as TransactionEntity, TransactionType } from '../entities/Transaction';
import { TransactionRepository } from '../../modules/transaction/domain/transactionRepository';
import { Transaction } from '../../modules/transaction/domain/transactionEntity';

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
      // For now, we'll handle category mapping later
      // categoryId: will be set when we migrate categories
    });

    const saved = await this.repository.save(entity);
    return saved.id;
  }

  async getAll(): Promise<Transaction[]> {
    const entities = await this.repository.find({
      relations: ['category', 'account'],
      order: { createdAt: 'DESC' }
    });
    
    return entities.map(entity => this.mapToTransaction(entity));
  }

  async findById(id: string): Promise<Transaction | null> {
    const entity = await this.repository.findOne({
      where: { id },
      relations: ['category', 'account']
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

  // Additional methods for SQLite-specific functionality
  async findByUserId(userId: string, limit?: number): Promise<Transaction[]> {
    const queryBuilder = this.repository.createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.category', 'category')
      .leftJoinAndSelect('transaction.account', 'account')
      .where('transaction.userId = :userId', { userId })
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
      // Map legacy fields for compatibility
      category: entity.category?.name || 'Другое',
      userName: undefined // We'll get this from User entity later
    };
  }
}