import type { Account } from '../model/types';

/** The accounts that make the total and are offered for records: hidden ones only stay in history. */
export function visibleAccounts(accounts: readonly Account[] | undefined): Account[] {
  return (accounts ?? []).filter((account) => !account.isHidden);
}

/** «сумы · карта», «доллары · наличные» (AccountList.md): the currency, then the type. */
export function accountCaption(account: Pick<Account, 'currency' | 'kind'>): string {
  return `${account.currency === 'USD' ? 'доллары' : 'сумы'} · ${account.kind === 'card' ? 'карта' : 'наличные'}`;
}

export type AccountIcon = 'cash' | 'card' | 'usd';

/** A banknote, a card, or «$» for a dollar account (AccountList.md). */
export function accountIcon(account: Pick<Account, 'currency' | 'kind'>): AccountIcon {
  if (account.currency === 'USD') return 'usd';
  return account.kind === 'card' ? 'card' : 'cash';
}
