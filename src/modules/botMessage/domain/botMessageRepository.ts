import { BotMessage, BotMessageChanges } from './botMessage';

export type NewBotMessage = Omit<BotMessage, 'createdAt' | 'updatedAt'>;

export interface BotMessageRepository {
  create(message: NewBotMessage): Promise<BotMessage>;
  findByMessage(chatId: string, messageId: number): Promise<BotMessage | null>;
  /** The chat's messages, newest first. */
  findByChat(chatId: string, limit: number): Promise<BotMessage[]>;
  /** The chat's messages with an open question (`openQuestion`), newest first. */
  findWithOpenQuestion(chatId: string): Promise<BotMessage[]>;
  update(id: string, changes: BotMessageChanges): Promise<BotMessage>;
}
