import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('usage_limits')
export class UsageLimit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', unique: true })
  userId!: string;

  @Column({ name: 'period_start', type: 'datetime' })
  periodStart!: Date;

  @Column({ name: 'period_end', type: 'datetime' })
  periodEnd!: Date;

  @Column({ name: 'transactions_count', default: 0 })
  transactionsCount!: number;

  @Column({ name: 'voice_inputs_count', default: 0 })
  voiceInputsCount!: number;

  @Column({ name: 'active_debts_count', default: 0 })
  activeDebtsCount!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
