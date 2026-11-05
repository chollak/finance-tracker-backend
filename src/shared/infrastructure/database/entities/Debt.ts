import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany
} from 'typeorm';

// Debts are gone from the code outside the capture path (#265, decision 2026-11-04): only CreateDebtUseCase, which the
// frozen capture path holds until #266, can still write this table, and nothing reads it. The entity stays so the
// `debts` table and its rows are kept and the schema check (`findSchemaDrift`, `npm run migration:show`) still matches
// it; dropping the table is a change to real data and waits for a separate «да».
type DebtPaymentRelation = {
  id: string;
  debtId: string;
  amount: number;
  note?: string;
  paidAt: Date;
  createdAt: Date;
};

export enum DebtType {
  I_OWE = 'i_owe',
  OWED_TO_ME = 'owed_to_me'
}

export enum DebtStatus {
  ACTIVE = 'active',
  PAID = 'paid',
  CANCELLED = 'cancelled'
}

@Entity('debts')
export class Debt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column({
    type: 'varchar',
    default: DebtType.I_OWE
  })
  type!: string;

  @Column()
  personName!: string;

  @Column('decimal', { precision: 12, scale: 2 })
  originalAmount!: number;

  @Column('decimal', { precision: 12, scale: 2 })
  remainingAmount!: number;

  @Column({ default: 'UZS' })
  currency!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({
    type: 'varchar',
    default: DebtStatus.ACTIVE
  })
  status!: string;

  @Column({ type: 'date', nullable: true })
  dueDate?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Link to transaction (when money was actually transferred)
  @Column({ nullable: true })
  relatedTransactionId?: string;

  // Split expenses support (for future)
  @Column({ nullable: true })
  splitGroupId?: string; // Group ID when debt is part of split expense

  @Column({ nullable: true })
  splitExpenseId?: string; // Original expense that was split

  @OneToMany('DebtPayment', 'debt')
  payments!: DebtPaymentRelation[];
}
