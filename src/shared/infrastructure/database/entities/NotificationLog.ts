import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * A notice the bot sent on its own (FT-124, FT-133): its kind (`daily_summary`, `goal_near`, `audit`…), what it is
 * about (`period`: a day, a month, a goal), how it went (`status`), which variant went out and to which message, the
 * answer to it and, after «Позже», the day it comes again; how many times it was tried and the last day a notice that
 * did not leave may still go out (FT-164). Unique per user, kind and period: the row is claimed before sending, so a
 * notice goes out at most once.
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

  @Column('varchar', { name: 'due_on', nullable: true })
  dueOn!: string | null;

  /** How many times it was tried (FT-164); 0 while it waits for its time, and for rows kept before. */
  @Column('integer', { default: 0 })
  attempts!: number;

  /** The last day (YYYY-MM-DD, the user's clock) a notice that did not leave may still go out (FT-164). */
  @Column('varchar', { name: 'send_until', nullable: true })
  sendUntil!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
