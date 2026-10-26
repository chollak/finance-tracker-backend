import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { bigintNumber } from '../transformers';

/**
 * A goal after the audit (FT-131): «Вдвое меньше», «Отказаться» or «Отменить» a subscription (`kind`), made by
 * «Готово» from one candidate of an audit (unique audit + candidate). The spending is its category and note group, or
 * a service of the catalog; the limit and the days it counts (`starts_on` — the audit day — to `ends_on`). A
 * subscription keeps its last charge and the months between charges, and the answer «Напомнить» / «Уже отменено».
 */
@Entity('goals')
@Index('IDX_goals_audit_candidate', ['auditId', 'candidateId'], { unique: true })
@Index('IDX_goals_user', ['userId'])
export class Goal {
  @PrimaryColumn()
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'audit_id' })
  auditId!: string;

  @Column({ name: 'candidate_id' })
  candidateId!: string;

  @Column()
  kind!: string;

  @Column()
  name!: string;

  @Column({ name: 'category_id' })
  categoryId!: string;

  @Column('varchar', { name: 'note_key', nullable: true })
  noteKey!: string | null;

  @Column('varchar', { name: 'service_key', nullable: true })
  serviceKey!: string | null;

  @Column('bigint', { name: 'monthly_minor', transformer: bigintNumber })
  monthlyMinor!: number;

  @Column('bigint', { name: 'limit_minor', default: 0, transformer: bigintNumber })
  limitMinor!: number;

  @Column('date', { name: 'starts_on' })
  startsOn!: string;

  @Column('date', { name: 'ends_on' })
  endsOn!: string;

  @Column('date', { name: 'last_charge_on', nullable: true })
  lastChargeOn!: string | null;

  @Column('integer', { name: 'charge_months', nullable: true })
  chargeMonths!: number | null;

  @Column('varchar', { name: 'subscription_state', nullable: true })
  subscriptionState!: string | null;

  @Column('date', { name: 'remind_on', nullable: true })
  remindOn!: string | null;

  @Column('date', { name: 'cancelled_on', nullable: true })
  cancelledOn!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
