import { createHash } from 'crypto';

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

/**
 * The id of the «Карта» created for a user on first need: derived from the user, so two first requests
 * at once (the bot and the Mini App) cannot create two — the second insert hits the primary key.
 * Accounts made by the FT-101 migration keep their random ids.
 */
export function starterAccountId(userId: string): string {
  const hex = createHash('sha256').update(`starter-account:${userId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** The account every user starts with; the history of before FT-101 moved onto it. */
export const DEFAULT_ACCOUNT = { name: 'Карта', kind: 'card' as AccountKind, currency: 'UZS' as Currency };
