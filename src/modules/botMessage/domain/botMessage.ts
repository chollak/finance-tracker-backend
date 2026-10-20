/**
 * A bot message about records (FT-122, docs/pastel/components/BotRecord.md, BotKeyboard.md): which
 * records it shows and which screen of its keyboard is open. Kept in `bot_messages`, so «Изменить»,
 * «Вернуть» and /undo keep working after the bot restarts. The records themselves stay in
 * `transactions`; the message is drawn from them on every change.
 */

/** The keyboard screen under the message: the confirmation, «Изменить», or one field of it. */
export const RECORD_MESSAGE_MODES = ['confirm', 'edit', 'category', 'account', 'date', 'amount'] as const;
export type RecordMessageMode = (typeof RECORD_MESSAGE_MODES)[number];

export function isRecordMessageMode(value: unknown): value is RecordMessageMode {
  return typeof value === 'string' && (RECORD_MESSAGE_MODES as readonly string[]).includes(value);
}

export interface RecordMessageState {
  /** The record being changed, by its place in the message (several records: the one picked). */
  selected: number;
  /**
   * The type whose categories the picker shows after «Это доход» / «Это расход». The record keeps its
   * type until a category of the other type is picked; «‹ Назад» drops the switch.
   */
  pickType?: 'income' | 'expense';
  /** The last change, shown in italics: «Сумма изменена: было 25 000». */
  changed?: string;
  /** Records whose category the parse guessed (FT-138): their category is shown with «?». */
  guessed: string[];
  /** The /undo reply that cancelled these records: «Вернуть» here also closes that reply. */
  undoMessageId?: number;
  /**
   * The records /undo cancelled: «Вернуть» brings back only these, not a record cancelled on purpose
   * before. Cleared once they are back, or when «Отменить» cancels the whole message.
   */
  undone?: string[];
}

export interface BotMessage {
  id: string;
  userId: string;
  /** Telegram chat id, as text: Telegram ids do not fit 32 bits. */
  chatId: string;
  /** Telegram message id; it grows within a chat, so it orders the chat's messages. */
  messageId: number;
  /** The records the message shows, in its order. */
  recordIds: string[];
  mode: RecordMessageMode;
  state: RecordMessageState;
  /** What the bot heard in a voice message: «Расслышал: «…»». */
  heard: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The changes a press makes to a message. */
export interface BotMessageChanges {
  mode?: RecordMessageMode;
  state?: RecordMessageState;
}
