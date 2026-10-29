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
  /**
   * ISO moment the first launch entered the opening balance (FT-163): what was written on the opening day before
   * it is already in the amount entered. Null — the whole opening day counts: accounts added later, the starter
   * «Карта», and accounts set by a first launch before FT-163.
   */
  openingAt: string | null;
  isHidden: boolean;
  sortOrder: number;
}

/** What decides whether a record or a move is in an account's balance. */
export interface BalanceOperation {
  /** YYYY-MM-DD; records written before FT-100 may keep a full moment, whose first ten characters are the day. */
  date: string;
  /** ISO moment it was written; stored ones always have it. */
  createdAt: string | null;
}

/** Records keep `createdAt` to the second, so moments are compared to the second. */
const secondOf = (iso: string) => Math.floor(Date.parse(iso) / 1000);

/**
 * Whether an operation counts in the account's balance (money-model «Остаток счёта»): from the opening date on, and
 * on the opening day only what was written from the moment the opening balance was entered (FT-163) — a coffee
 * written in the bot in the morning is already in «Сколько у вас сейчас денег?». One written in the same second as
 * the first launch counts. Same rule as `balanceChanges` of the repository, which sums in SQL — down to a missing or
 * unreadable moment on the opening day, which is not «from the first launch on» there either (strftime gives NULL).
 */
export function countsInBalance(account: Pick<Account, 'openingDate' | 'openingAt'>, operation: BalanceOperation): boolean {
  const day = operation.date.slice(0, 10);
  if (day !== account.openingDate) return day > account.openingDate;
  if (!account.openingAt) return true;
  if (!operation.createdAt) return false;
  return secondOf(operation.createdAt) >= secondOf(account.openingAt);
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
  return uuidFrom(`starter-account:${userId}`);
}

/** A uuid-shaped id derived from the seed: the same seed always gives the same id. */
export function uuidFrom(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** The account every user starts with; the history of before FT-101 moved onto it. */
export const DEFAULT_ACCOUNT = { name: 'Карта', kind: 'card' as AccountKind, currency: 'UZS' as Currency };
