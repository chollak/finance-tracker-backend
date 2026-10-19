import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { bigintNumber } from '../transformers';

/** One row per user, written on the first change; defaults live in the domain (FT-098). */
@Entity('user_settings')
export class UserSettings {
  @PrimaryColumn({ name: 'user_id' })
  userId!: string;

  @Column({ default: 'telegram' })
  theme!: string;

  @Column({ name: 'daily_summary_enabled', default: true })
  dailySummaryEnabled!: boolean;

  @Column({ name: 'daily_summary_time', default: '21:00' })
  dailySummaryTime!: string;

  @Column({ name: 'audit_enabled', default: true })
  auditEnabled!: boolean;

  @Column({ name: 'audit_time', default: '10:00' })
  auditTime!: string;

  @Column({ name: 'goal_alerts_enabled', default: true })
  goalAlertsEnabled!: boolean;

  @Column('bigint', { name: 'fx_own_rate_minor', nullable: true, transformer: bigintNumber })
  fxOwnRateMinor!: number | null;

  @Column('date', { name: 'fx_own_since', nullable: true })
  fxOwnSince!: string | null;

  @Column('varchar', { name: 'default_account_id', nullable: true })
  defaultAccountId!: string | null;

  @Column('datetime', { name: 'onboarded_at', nullable: true })
  onboardedAt!: Date | null;

  @Column('integer', { name: 'receipt_tips_seen', default: 0 })
  receiptTipsSeen!: number;

  @Column('date', { name: 'audit_invite_snoozed_until', nullable: true })
  auditInviteSnoozedUntil!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
