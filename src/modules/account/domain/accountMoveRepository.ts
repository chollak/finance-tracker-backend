import { AccountMove } from './accountMove';

export interface AccountMoveRepository {
  create(move: AccountMove): Promise<AccountMove>;
  /** A move by id, deleted or not. */
  findById(id: string): Promise<AccountMove | null>;
  /** Moves into or out of the account that are not deleted. */
  findByAccount(accountId: string): Promise<AccountMove[]>;
  /** All of the user's moves that are not deleted (FT-126: the export), oldest first. */
  findByUserId(userId: string): Promise<AccountMove[]>;
  /** Deletes softly (a date) or restores (null). */
  setDeletedAt(id: string, deletedAt: Date | null): Promise<AccountMove>;
}
