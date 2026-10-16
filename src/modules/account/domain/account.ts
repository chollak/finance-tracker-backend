/**
 * Accounts (FT-101, docs/pastel/money-model.md → `accounts`).
 *
 * Money lives on accounts: cash, card, a dollar account. An account is hidden, never deleted — it
 * leaves the total and the pickers, its records stay in history and analytics.
 */

export type AccountKind = 'cash' | 'card';
export type Currency = 'UZS' | 'USD';

export const ACCOUNT_KINDS: readonly AccountKind[] = ['cash', 'card'];
export const CURRENCIES: readonly Currency[] = ['UZS', 'USD'];
export const ACCOUNT_NAME_MAX_LENGTH = 40;

export interface Account {
  id: string;
  userId: string;
  name: string;
  kind: AccountKind;
  currency: Currency;
  /** «Сколько на нём сейчас» when the account was set up — not income. Minor units of its currency. */
  openingBalanceMinor: number;
  /** The balance counts records and moves from this date (YYYY-MM-DD). */
  openingDate: string;
  isHidden: boolean;
  sortOrder: number;
}

export interface AccountWithBalance extends Account {
  /** Minor units of the account's currency. */
  balanceMinor: number;
}

export function isAccountKind(value: unknown): value is AccountKind {
  return value === 'cash' || value === 'card';
}

export function isCurrency(value: unknown): value is Currency {
  return value === 'UZS' || value === 'USD';
}

export function accountNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

/** The account every user starts with; the history of before FT-101 moved onto it. */
export const DEFAULT_ACCOUNT = { name: 'Карта', kind: 'card' as AccountKind, currency: 'UZS' as Currency };
