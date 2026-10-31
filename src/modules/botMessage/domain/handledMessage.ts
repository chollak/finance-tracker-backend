import { RecordMessageMode, RecordMessageState } from './botMessage';

/**
 * A chat message the bot handled (FT-172), by its client id `tg-<bot>-<chat>-<message>` (FT-167). Telegram sends a
 * message again when the bot stopped before confirming it; what the message did is found here when no record carries
 * its client id — the record message whose question it answered or whose records /undo cancelled — and so is the
 * confirmation of its records while it may not have gone out. Telegram gives up on an update after a day, so a row is
 * kept for `HANDLED_MESSAGE_DAYS`.
 */
export interface HandledMessage {
  clientId: string;
  userId: string;
  chatId: string;
  /** The record message it changed: the answer to its «Сумму» or large amount, or /undo. */
  botMessageId: number | null;
  /** The confirmation of its records about to be sent; null once it is sent and remembered. */
  confirmation: RecordMessageDraft | null;
  createdAt: Date;
}

/** What a record message is about to show: a row of `bot_messages` without the Telegram message it does not have yet. */
export interface RecordMessageDraft {
  recordIds: string[];
  mode: RecordMessageMode;
  state: RecordMessageState;
  heard: string | null;
}

/** How long a handled chat message is kept: Telegram sends an update again for up to a day. */
export const HANDLED_MESSAGE_DAYS = 2;
