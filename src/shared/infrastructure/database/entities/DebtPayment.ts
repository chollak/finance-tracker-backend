import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn
} from 'typeorm';
import { Debt } from './Debt';

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

  @ManyToOne(() => Debt, (debt) => debt.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'debtId' })
  debt!: Debt;
}
