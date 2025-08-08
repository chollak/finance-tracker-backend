import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';
import { Category } from './Category';
import { Account } from './Account';

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
  type!: string;

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

  // Relationships
  @ManyToOne(() => User, user => user.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: string;

  @ManyToOne(() => Category, category => category.transactions, { nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category?: Category;

  @Column({ nullable: true })
  categoryId?: string;

  @ManyToOne(() => Account, account => account.transactions, { nullable: true })
  @JoinColumn({ name: 'accountId' })
  account?: Account;

  @Column({ nullable: true })
  accountId?: string;
}