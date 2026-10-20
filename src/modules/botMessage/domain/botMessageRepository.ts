import { BotMessage, BotMessageChanges, RecordMessageMode } from './botMessage';

export type NewBotMessage = Omit<BotMessage, 'createdAt' | 'updatedAt'>;

export interface BotMessageRepository {
  create(message: NewBotMessage): Promise<BotMessage>;
  findByMessage(chatId: string, messageId: number): Promise<BotMessage | null>;
  /** The chat's messages, newest first. */
  findByChat(chatId: string, limit: number): Promise<BotMessage[]>;
  /** The chat's messages with this keyboard screen open, newest first. */
  findByMode(chatId: string, mode: RecordMessageMode): Promise<BotMessage[]>;
  update(id: string, changes: BotMessageChanges): Promise<BotMessage>;
}
