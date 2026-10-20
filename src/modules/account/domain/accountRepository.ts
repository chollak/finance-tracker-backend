import { Account } from './account';

/** What an update may change; the opening balance and date are set by the first launch (FT-109), the balance
 * also with a new currency while the account has no operations (FT-118). */
export type AccountChanges = Partial<
  Pick<Account, 'name' | 'kind' | 'currency' | 'isHidden' | 'sortOrder' | 'openingBalanceMinor' | 'openingDate'>
>;

export interface AccountRepository {
  /** All of the user's accounts, hidden included, in sort order. */
  findByUserId(userId: string): Promise<Account[]>;
  findById(id: string): Promise<Account | null>;
  create(account: Account): Promise<Account>;
  update(id: string, changes: AccountChanges): Promise<Account>;
  /** Balance change of each account from its opening date: records by type, plus moves (FT-104). */
  balanceChanges(userId: string): Promise<Map<string, number>>;
  /** Whether any record or move refers to the account — then its currency can no longer change. */
  hasOperations(accountId: string): Promise<boolean>;
  /**
   * Deletes an account no record or move refers to, deleted ones included (FT-118: «Отменить» right after «Счёт
   * добавлен»), in one statement; false when it has operations — such an account is hidden, never deleted.
   */
  deleteIfUnused(accountId: string): Promise<boolean>;
}
