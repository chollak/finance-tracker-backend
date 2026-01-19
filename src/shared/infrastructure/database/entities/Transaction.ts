import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense'
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount!: number;

  @Column()
  type!: 'income' | 'expense';

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

  // Category name (simplified, no foreign key)
  @Column({ nullable: true, default: 'Другое' })
  category?: string;

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