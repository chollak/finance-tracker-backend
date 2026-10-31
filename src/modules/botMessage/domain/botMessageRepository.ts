import { BotMessage, BotMessageChanges } from './botMessage';
import { HandledMessage } from './handledMessage';

export type NewBotMessage = Omit<BotMessage, 'createdAt' | 'updatedAt'>;

/** A handled chat message to write; of `botMessageId` and `confirmation`, only those given are written over (FT-172). */
export type HandledMessageWrite = Pick<HandledMessage, 'clientId' | 'userId' | 'chatId'> &
  Partial<Pick<HandledMessage, 'botMessageId' | 'confirmation'>>;

export interface BotMessageRepository {
  create(message: NewBotMessage): Promise<BotMessage>;
  findByMessage(chatId: string, messageId: number): Promise<BotMessage | null>;
  /** The chat's messages, newest first. */
  findByChat(chatId: string, limit: number): Promise<BotMessage[]>;
  /** The chat's messages with an open question (`openQuestion`), newest first. */
  findWithOpenQuestion(chatId: string): Promise<BotMessage[]>;
  update(id: string, changes: BotMessageChanges): Promise<BotMessage>;
  /** What the bot did with a chat message (FT-172); null when it is not kept. */
  findHandled(clientId: string): Promise<HandledMessage | null>;
  saveHandled(message: HandledMessageWrite): Promise<void>;
  /** Removes the handled messages kept longer than `days` days; how many went. */
  deleteHandledOlderThan(days: number): Promise<number>;
}
