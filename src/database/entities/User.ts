import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Transaction } from './Transaction';
import { Category } from './Category';
import { Account } from './Account';
import { Budget } from './Budget';

@Entity('users')
export class User {
  @PrimaryColumn()
  telegramId!: string;

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @Column({ nullable: true })
  username?: string;

  @Column({ default: 'ru' })
  language!: string;

  @Column({ default: 'UZS' })
  currency!: string;

  @Column('text', { nullable: true })
  preferences?: string; // JSON string for user preferences

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Relationships
  @OneToMany(() => Transaction, transaction => transaction.user)
  transactions!: Transaction[];

  @OneToMany(() => Category, category => category.user)
  categories!: Category[];

  @OneToMany(() => Account, account => account.user)
  accounts!: Account[];

  @OneToMany(() => Budget, budget => budget.user)
  budgets!: Budget[];
}