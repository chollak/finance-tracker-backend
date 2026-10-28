import { Account } from '../../account/domain/account';
import { AccountMove } from '../../account/domain/accountMove';
import { Transaction } from '../../transaction/domain/transactionEntity';
import { AppError } from '../../../shared/domain/errors/AppError';

/**
 * Ports of the export (FT-126): where the records, moves and accounts come from, and how a file reaches the user's
 * private chat with the bot.
 */

/** What goes into the file; wired to the transaction and account modules in createModules(). */
export interface ExportSources {
  /** The user's records that are not deleted (nor archived), in any order. */
  records(userId: string): Promise<Transaction[]>;
  /** The user's moves that are not deleted, in any order. */
  moves(userId: string): Promise<AccountMove[]>;
  /** All of the user's accounts, hidden ones too: a record of a hidden account names it. */
  accounts(userId: string): Promise<Account[]>;
}

/** One export: the CSV text and what the screen and the bot say about it. */
export interface RecordsFile {
  /** «kapelka-2026-10-14.csv». */
  fileName: string;
  /** UTF-8 text with a byte order mark, so Excel reads the Cyrillic. */
  text: string;
  /** Records and moves in it; a transfer is one, though it takes two lines. */
  count: number;
  /** The day it was made, YYYY-MM-DD in the user's time zone. */
  date: string;
}

/** Sends a file to the user's private chat with the bot: its id is the user's Telegram id. */
export interface ChatFileSender {
  /** Throws ChatClosedError when Telegram will not let the bot write there, anything else on other failures. */
  sendFile(chatId: string, file: RecordsFile): Promise<void>;
}

/** The bot may not write to the user: blocked, or the chat was never started. */
export class ChatClosedError extends AppError {
  readonly code = 'BOT_CHAT_CLOSED';
  readonly statusCode = 422;

  constructor() {
    super('The bot cannot write to this chat');
  }
}
