import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from './User';
import { Transaction } from './Transaction';

export enum AccountType {
  CASH = 'cash',
  BANK = 'bank',
  CARD = 'card',
  SAVINGS = 'savings',
  INVESTMENT = 'investment'
}

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ default: AccountType.CASH })
  type!: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  balance!: number;

  @Column({ default: 'UZS' })
  currency!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => User, user => user.accounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: string;

  @OneToMany(() => Transaction, transaction => transaction.account)
  transactions!: Transaction[];
}