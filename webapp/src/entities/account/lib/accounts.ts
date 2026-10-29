import type { Account } from '../model/types';

/** The accounts that make the total and are offered for records: hidden ones only stay in history. */
export function visibleAccounts(accounts: readonly Account[] | undefined): Account[] {
  return (accounts ?? []).filter((account) => !account.isHidden);
}

/**
 * The account a new record goes to when the record names none, as the server picks it (`accountBook.resolveForRecord`):
 * the chosen default while it is visible, else the first visible account (FT-101, FT-149). Null without a visible
 * account.
 */
export function defaultRecordAccount(accounts: readonly Account[] | undefined, defaultAccountId: string | null | undefined): Account | null {
  const visible = visibleAccounts(accounts);
  return visible.find((account) => account.id === defaultAccountId) ?? visible[0] ?? null;
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
