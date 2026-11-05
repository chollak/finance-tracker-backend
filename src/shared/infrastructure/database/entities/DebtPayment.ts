import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn
} from 'typeorm';

// Debt payments are gone from the code (#265, decision 2026-11-04): nothing reads or writes this table. The entity
// stays so the `debt_payments` table and its rows are kept and the schema check still matches it (see Debt.ts).
type DebtRelation = {
  id: string;
};

@Entity('debt_payments')
export class DebtPayment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  debtId!: string;

  @Column('decimal', { precision: 12, scale: 2 })
  amount!: number;

  @Column({ nullable: true })
  note?: string;

  @Column({ type: 'datetime' })
  paidAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne('Debt', 'payments', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'debtId' })
  debt!: DebtRelation;
}
