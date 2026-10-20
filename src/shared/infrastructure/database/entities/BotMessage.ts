import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * A bot message about records (FT-122): the records it shows (`record_ids`, a JSON array) and the open
 * keyboard screen (`mode`, `state` — JSON). One row per Telegram message.
 */
@Entity('bot_messages')
@Index('IDX_bot_messages_message', ['chatId', 'messageId'], { unique: true })
export class BotMessage {
  @PrimaryColumn()
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'chat_id' })
  chatId!: string;

  @Column('integer', { name: 'message_id' })
  messageId!: number;

  @Column('text', { name: 'record_ids' })
  recordIds!: string;

  @Column({ default: 'confirm' })
  mode!: string;

  @Column('text')
  state!: string;

  @Column('text', { nullable: true })
  heard!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
