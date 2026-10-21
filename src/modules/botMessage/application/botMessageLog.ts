import { randomUUID } from 'crypto';
import { BotMessage, BotMessageChanges, RecordMessageMode, RecordMessageState } from '../domain/botMessage';
import { BotMessageRepository } from '../domain/botMessageRepository';

/** How far back /undo looks for the last message with records still in place. */
export const RECENT_MESSAGES_LIMIT = 20;

export interface RememberBotMessageInput {
  userId: string;
  chatId: string;
  messageId: number;
  recordIds: string[];
  /** Records whose category the parse guessed (FT-138). */
  guessed?: string[];
  heard?: string | null;
  /** The screen the message opens on: the confirmation, or `large` when its records are held (FT-123). */
  mode?: RecordMessageMode;
  /** What else the message starts with (FT-123): «45» read as 45 000, items without an amount, notes. */
  state?: Partial<RecordMessageState>;
}

/**
 * The bot's memory of its record messages (FT-122): what each message shows and which keyboard screen
 * is open. Like the other module services it throws on storage errors; the bot handlers catch them.
 */
export class BotMessageLog {
  constructor(private repository: BotMessageRepository) {}

  /** A confirmation just sent: the records it shows, on the confirmation screen. */
  remember(input: RememberBotMessageInput): Promise<BotMessage> {
    return this.repository.create({
      id: randomUUID(),
      userId: input.userId,
      chatId: input.chatId,
      messageId: input.messageId,
      recordIds: [...input.recordIds],
      mode: input.mode ?? 'confirm',
      state: { selected: 0, ...input.state, guessed: [...(input.guessed ?? input.state?.guessed ?? [])] },
      heard: input.heard?.trim() ? input.heard.trim() : null,
    });
  }

  find(chatId: string, messageId: number): Promise<BotMessage | null> {
    return this.repository.findByMessage(chatId, messageId);
  }

  /** The chat's newest record messages first — where /undo looks for the last record. */
  recent(chatId: string, limit: number = RECENT_MESSAGES_LIMIT): Promise<BotMessage[]> {
    return this.repository.findByChat(chatId, limit);
  }

  /**
   * The message whose question waits for an amount as the next text of the chat, if any: the new amount
   * after «Сумму», «Сколько?» of an item named without one, or the right amount of a large one (FT-123).
   */
  async awaitingAmount(chatId: string): Promise<BotMessage | null> {
    const [newest] = await this.repository.findWithOpenQuestion(chatId);
    return newest ?? null;
  }

  /** Other messages of the chat with an open question: one question at a time. */
  async otherQuestions(message: BotMessage): Promise<BotMessage[]> {
    return (await this.repository.findWithOpenQuestion(message.chatId)).filter(other => other.id !== message.id);
  }

  save(message: BotMessage, changes: BotMessageChanges): Promise<BotMessage> {
    return this.repository.update(message.id, changes);
  }
}
