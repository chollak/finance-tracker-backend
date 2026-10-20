import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * A notice the bot sent on its own (FT-124): its kind (`daily_summary`), the period it is about (`2026-10-14`),
 * how it went (`status`), which variant went out and to which message, and the answer to it. Unique per user,
 * kind and period: the row is claimed before sending, so a notice goes out at most once.
 */
@Entity('notifications_log')
@Index('IDX_notifications_log_period', ['userId', 'kind', 'period'], { unique: true })
export class NotificationLog {
  @PrimaryColumn()
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column()
  kind!: string;

  @Column()
  period!: string;

  @Column({ default: 'sending' })
  status!: string;

  @Column('varchar', { nullable: true })
  variant!: string | null;

  @Column('varchar', { name: 'chat_id', nullable: true })
  chatId!: string | null;

  @Column('integer', { name: 'message_id', nullable: true })
  messageId!: number | null;

  @Column('varchar', { nullable: true })
  answer!: string | null;

  @Column('text', { nullable: true })
  error!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
