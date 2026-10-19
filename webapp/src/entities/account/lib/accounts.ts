import type { Account } from '../model/types';

/** The accounts that make the total and are offered for records: hidden ones only stay in history. */
export function visibleAccounts(accounts: readonly Account[] | undefined): Account[] {
  return (accounts ?? []).filter((account) => !account.isHidden);
}
