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
@Index('IDX_transactions_user_client', ['userId', 'clientId'], { unique: true })
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

  /** Currency of the amount: the account's at the time of writing (FT-103). */
  @Column({ default: 'UZS' })
  currency!: string;

  /** Where the record came from: telegram, miniapp, ios_shortcut, receipt, manual (FT-103); null for older records. */
  @Column('varchar', { nullable: true })
  source?: string | null;

  /** The pre-FT-099 category string (old id or name), kept until FT-136 for the migration report. */
  @Column('varchar', { name: 'legacy_category', nullable: true })
  legacyCategory?: string | null;

  // Archive support - archived transactions are excluded from analytics
  @Column({ default: false })
  isArchived!: boolean;

  /**
   * Deleted softly (FT-105): «Отменить» brings the record back. The repository leaves deleted records
   * out of every read unless asked for them by id.
   */
  @Column('datetime', { name: 'deleted_at', nullable: true })
  deletedAt?: Date | null;

  /** Note and merchant as searched (FT-107): `recordSearchText`, kept in step on every write. */
  @Column('varchar', { name: 'search_text', default: '' })
  searchText!: string;

  /** The client's id for the record (FT-106), unique per user: a repeated create returns this record. */
  @Column('varchar', { name: 'client_id', nullable: true })
  clientId?: string | null;

  // Debt-related fields
  @Column({ default: false })
  isDebtRelated!: boolean; // True if this transaction is related to a debt

  @Column({ nullable: true })
  relatedDebtId?: string; // Link to the debt entity

  // Split expenses support (for future)
  @Column({ nullable: true })
  splitGroupId?: string; // Group ID for split expenses
}