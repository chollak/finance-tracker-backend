import { Account } from './account';

export interface AccountRepository {
  /** All of the user's accounts, hidden included, in sort order. */
  findByUserId(userId: string): Promise<Account[]>;
  findById(id: string): Promise<Account | null>;
  create(account: Account): Promise<Account>;
  update(id: string, changes: Partial<Pick<Account, 'name' | 'kind' | 'currency' | 'isHidden' | 'sortOrder'>>): Promise<Account>;
  /** Balance change of each account from its opening date: records by type, plus moves (FT-104). */
  balanceChanges(userId: string): Promise<Map<string, number>>;
  /** Whether any record or move refers to the account — then its currency can no longer change. */
  hasOperations(accountId: string): Promise<boolean>;
}
