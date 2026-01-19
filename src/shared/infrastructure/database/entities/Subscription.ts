import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ default: 'free' })
  tier!: string; // 'free' | 'premium'

  @Column({ default: 'payment' })
  source!: string; // 'payment' | 'trial' | 'gift' | 'lifetime'

  @Column({ default: 'active' })
  status!: string; // 'active' | 'expired' | 'cancelled'

  @Column({ name: 'price_stars', default: 100 })
  priceStars!: number;

  @Column({ default: 'XTR' })
  currency!: string;

  @Column({ name: 'start_date', type: 'datetime' })
  startDate!: Date;

  @Column({ name: 'end_date', type: 'datetime', nullable: true })
  endDate?: Date;

  @Column({ name: 'trial_ends_at', type: 'datetime', nullable: true })
  trialEndsAt?: Date;

  @Column({ name: 'telegram_payment_charge_id', nullable: true })
  telegramPaymentChargeId?: string;

  @Column({ name: 'provider_payment_charge_id', nullable: true })
  providerPaymentChargeId?: string;

  @Column({ name: 'auto_renew', default: true })
  autoRenew!: boolean;

  @Column({ name: 'granted_by', nullable: true })
  grantedBy?: string;

  @Column({ name: 'grant_note', nullable: true })
  grantNote?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'cancelled_at', type: 'datetime', nullable: true })
  cancelledAt?: Date;

  @Column({ name: 'cancellation_reason', nullable: true })
  cancellationReason?: string;
}
