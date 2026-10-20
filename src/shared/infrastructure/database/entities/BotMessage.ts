import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * A bot message about records (FT-122): the records it shows (`record_ids`, a JSON array) and the open
 * keyboard screen (`mode`, `state` — JSON). One row per Telegram message. `question` (FT-123) is what the
 * chat's next text is read as — derived from `mode` and `state` on every write, kept as a column so the
 * chat's open question is found by a query.
 */
@Entity('bot_messages')
@Index('IDX_bot_messages_message', ['chatId', 'messageId'], { unique: true })
@Index('IDX_bot_messages_question', ['chatId', 'question'])
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

  @Column('varchar', { nullable: true })
  question!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
