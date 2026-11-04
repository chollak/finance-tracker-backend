import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// Budgets are gone from the code (#264, decision 2026-11-04): no module, route or screen reads or writes this table.
// The entity stays only so the `budgets` table and its rows are kept and the schema check
// (`findSchemaDrift`, `npm run migration:show`) still matches it; dropping the table is a change to real data and
// waits for a separate «да».
enum BudgetPeriod {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly', 
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly'
}

@Entity('budgets')
export class Budget {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount!: number;

  @Column({ default: BudgetPeriod.MONTHLY })
  period!: string;

  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date' })
  endDate!: string;

  @Column('text', { nullable: true })
  categoryIds?: string; // JSON array of category IDs

  @Column({ default: true })
  isActive!: boolean;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  spent!: number; // Current spent amount (calculated)

  @Column({ nullable: true })
  description?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // User ID for tracking budgets per user
  @Column()
  userId!: string;
}