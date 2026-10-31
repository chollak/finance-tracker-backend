import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * A chat message the bot handled (FT-172), by its client id `tg-<bot>-<chat>-<message>`: the record message it changed
 * (`bot_message_id` — the answer to a question, /undo), or the confirmation of its records about to be sent
 * (`confirmation` — JSON of `record_ids`, `mode`, `state`, `heard`, cleared once it is sent). Kept for two days.
 */
@Entity('handled_messages')
@Index('IDX_handled_messages_created', ['createdAt'])
export class HandledMessage {
  @PrimaryColumn({ name: 'client_id' })
  clientId!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'chat_id' })
  chatId!: string;

  @Column('integer', { name: 'bot_message_id', nullable: true })
  botMessageId!: number | null;

  @Column('text', { nullable: true })
  confirmation!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
