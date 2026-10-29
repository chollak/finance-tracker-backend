import { ItemWithoutAmount } from '../../voiceProcessing/domain/processedTransaction';

/**
 * A bot message about records (FT-122, docs/pastel/components/BotRecord.md, BotKeyboard.md): which
 * records it shows and which screen of its keyboard is open. Kept in `bot_messages`, so «Изменить»,
 * «Вернуть» and /undo keep working after the bot restarts. The records themselves stay in
 * `transactions`; the message is drawn from them on every change.
 */

/**
 * The keyboard screen under the message: the confirmation, «Изменить», or one field of it; `large` —
 * «Сумма большая: … Пока не записал — сумма верная?» (FT-123), the records held until it is answered.
 */
export const RECORD_MESSAGE_MODES = ['confirm', 'edit', 'category', 'account', 'date', 'amount', 'large'] as const;
export type RecordMessageMode = (typeof RECORD_MESSAGE_MODES)[number];

export function isRecordMessageMode(value: unknown): value is RecordMessageMode {
  return typeof value === 'string' && (RECORD_MESSAGE_MODES as readonly string[]).includes(value);
}

/**
 * What the chat's next text is read as (design-system «Один вопрос за раз», FT-123): the new amount after
 * «Сумму», the amount of an item named without one («Сколько?»), or the right amount of a large one. All
 * three are answered by an amount only; any other text closes the question.
 */
export const BOT_QUESTIONS = ['amount', 'missing', 'large'] as const;
export type BotQuestion = (typeof BOT_QUESTIONS)[number];

export function isBotQuestion(value: unknown): value is BotQuestion {
  return typeof value === 'string' && (BOT_QUESTIONS as readonly string[]).includes(value);
}

/** «45» read as 45 000 (FT-103): what was written and the amount it became. */
export interface AssumedThousands {
  written: string;
  amountMinor: number;
}

/** The large-amount question (FT-123): which record of the message, and whether its typed answer is still awaited. */
export interface LargeAmountQuestion {
  index: number;
  /** «Если сумма другая — напишите её» withdrawn by a text that was not an amount; the buttons stay. */
  replyClosed?: boolean;
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
  /** «45» read as 45 000, by record id (FT-123): «"45" понял как 45 000 сум.» while the amount is that. */
  assumed?: Record<string, AssumedThousands>;
  /** Named without an amount and still asked «Сколько?» — the first one (FT-123). */
  missing?: ItemWithoutAmount[];
  /** What was not written, in the order it happened: «"Такси" — без суммы, не записал.» (FT-123). */
  notes?: string[];
  /** The large-amount question, while the message is on the `large` screen (FT-123). */
  large?: LargeAmountQuestion;
  /** Records of a large amount the person chose not to write: they stay deleted and out of the message. */
  declined?: string[];
  /** Where «‹ Назад» of the category picker leads: back to the confirmation after «Другая» (FT-123). */
  back?: 'confirm';
  /**
   * The client id of the chat message whose amount changed a record here — the answer to «Сумму» or to a large
   * amount, «не 25, а 28» (FT-167). Such an answer writes no record of its own: sent again after a restart, it is
   * found by this instead, and changes nothing more.
   */
  answeredBy?: string;
}

/** The question the message asks, if any; at most one message of a chat has one. */
export function openQuestion(mode: RecordMessageMode, state: RecordMessageState): BotQuestion | null {
  if (mode === 'amount') return 'amount';
  if (mode === 'large') return state.large?.replyClosed ? null : 'large';
  return state.missing && state.missing.length > 0 ? 'missing' : null;
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
