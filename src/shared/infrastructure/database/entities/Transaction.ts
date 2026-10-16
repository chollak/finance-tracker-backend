import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { bigintNumber } from '../transformers';
import { Category } from './Category';

export enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense'
}

@Entity('transactions')
@Index('IDX_transactions_user_date', ['userId', 'date'])
@Index('IDX_transactions_account', ['accountId'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Integer minor units: тийины for UZS, cents for USD (FT-097). Replaced `amount decimal(10,2)`. */
  @Column('bigint', { name: 'amount_minor', transformer: bigintNumber })
  amountMinor!: number;

  @Column()
  type!: 'income' | 'expense';

  @Column({ default: 'expense' })
  semanticType!: string;

  @Column({ default: false })
  needsReview!: boolean;

  @Column()
  description!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ nullable: true })
  merchant?: string;

  @Column('decimal', { precision: 3, scale: 2, nullable: true })
  confidence?: number; // AI confidence score

  @Column('text', { nullable: true })
  originalText?: string; // Original voice/text input

  @Column('text', { nullable: true })
  originalParsing?: string; // JSON string of original AI parsing

  @Column({ nullable: true })
  tags?: string; // Comma-separated tags

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // User ID for tracking transactions per user
  @Column()
  userId!: string;

  /** The user's category (FT-099). Integrity is kept by the application; there is no FK constraint. */
  @Column({ name: 'category_id' })
  categoryId!: string;

  /** Loaded with the record so its current name can be shown. */
  @ManyToOne(() => Category, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'category_id' })
  categoryRef?: Category;

  /** The account the money moved on (FT-101). Integrity is kept by the application. */
  @Column({ name: 'account_id' })
  accountId!: string;

  /** The pre-FT-099 category string (old id or name), kept until FT-136 for the migration report. */
  @Column('varchar', { name: 'legacy_category', nullable: true })
  legacyCategory?: string | null;

  // Archive support - archived transactions are excluded from analytics
  @Column({ default: false })
  isArchived!: boolean;

  // Debt-related fields
  @Column({ default: false })
  isDebtRelated!: boolean; // True if this transaction is related to a debt

  @Column({ nullable: true })
  relatedDebtId?: string; // Link to the debt entity

  // Split expenses support (for future)
  @Column({ nullable: true })
  splitGroupId?: string; // Group ID for split expenses
}