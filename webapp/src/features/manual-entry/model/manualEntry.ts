import { visibleAccounts, type Account } from '@/entities/account';
import { pickableCategories, type Category } from '@/entities/category';
import { dayMonth, relativeDayLabel, type LocalDate } from '@/shared/lib/dates';
import {
  amountFontSize,
  CURRENCY_UNIT,
  emptyKeypad,
  formatMinor,
  keypadDisplay,
  keypadToMinor,
  MINUS,
  NBSP,
  pressKey,
  usdToUzsMinor,
  uzsToUsdMinor,
  type Currency,
  type KeypadKey,
  type KeypadState,
} from '@/shared/lib/money';
import type { PastelColor } from '@/shared/lib/pastel/categoryColors';

/**
 * Manual entry (FT-113, boards «Ручной ввод» and «Ручной ввод · тёмная»): the amount on the app's own
 * keypad, «Расход / Доход», the account, the category tiles, the date and a note. Pure state and what the
 * screen shows of it; the screen only renders and the API layer only writes.
 */

export type EntryType = 'expense' | 'income';

export interface ManualEntryState {
  type: EntryType;
  /** null for a guest, who has no accounts. */
  accountId: string | null;
  amount: KeypadState;
  categoryId: string | null;
  date: LocalDate;
  note: string;
}

/** What the screen is filled from. */
export interface EntryContext {
  /** The user's accounts (hidden ones are not offered); none for a guest. */
  accounts: readonly Account[];
  /** The user's categories (hidden ones are not offered). */
  categories: readonly Category[];
  /** The USD rate in effect, сум×100 per 1 USD; null while there is none. */
  rateMinor: number | null;
  /** Today in the user's local time. */
  today: LocalDate;
}

export interface EntryAccountChoice {
  id: string;
  name: string;
  /** «1 250 000 сум», «420,00 USD». */
  balance: string;
  selected: boolean;
}

export interface EntryCategoryChoice {
  id: string;
  name: string;
  color: PastelColor;
  selected: boolean;
}

export interface ManualEntryModel {
  currency: Currency;
  amount: {
    /** «−186 400», «+12 500 000», «0» before anything is typed. */
    text: string;
    unit: string;
    /** Nothing typed yet — muted; expenses ink, income green. */
    tone: 'placeholder' | 'expense' | 'income';
    /** Shrinks instead of wrapping (amount-xl, 40, 32px). */
    size: 50 | 40 | 32;
  };
  /** «≈ 14,74 USD», «≈ 5 313 000 сум», «1 USD = 12 650 сум»; null without a rate. */
  conversion: string | null;
  accounts: EntryAccountChoice[];
  categories: EntryCategoryChoice[];
  categoriesTitle: 'Категория расхода' | 'Категория дохода';
  date: { label: string; ariaLabel: string };
  /** The one main button: what is missing, or «Сохранить расход / доход». */
  save: { label: string; ready: boolean };
}

/** What is written: `POST /api/transactions` for a signed-in user, the device for a guest. */
export interface ManualEntryRecord {
  type: EntryType;
  /** Integer minor units of `currency`. */
  amountMinor: number;
  currency: Currency;
  /** Absent for a guest: the record has no account. */
  accountId?: string;
  categoryId: string;
  categoryName: string;
  date: LocalDate;
  /** Trimmed; empty when there is none. */
  note: string;
}

/** The account a new record starts on, as the server picks it: the default if visible, else the first visible. */
export function entryAccountId(accounts: readonly Account[], defaultAccountId: string | null | undefined): string | null {
  const visible = visibleAccounts(accounts);
  return visible.find((account) => account.id === defaultAccountId)?.id ?? visible[0]?.id ?? null;
}

/** An expense by default; an income when opened for one («Записать доход» of an empty month of analytics). */
export function initialManualEntry(today: LocalDate, accountId: string | null, type: EntryType = 'expense'): ManualEntryState {
  return { type, accountId, amount: emptyKeypad(), categoryId: null, date: today, note: '' };
}

function accountOf(state: ManualEntryState, accounts: readonly Account[]): Account | undefined {
  return state.accountId ? accounts.find((account) => account.id === state.accountId) : undefined;
}

/** The currency of the chosen account; сум without one. */
export function entryCurrency(state: ManualEntryState, accounts: readonly Account[]): Currency {
  return accountOf(state, accounts)?.currency ?? 'UZS';
}

/** «Расход / Доход»: the other type has its own categories, so the choice is cleared (Segmented.md). */
export function chooseType(state: ManualEntryState, type: EntryType): ManualEntryState {
  return state.type === type ? state : { ...state, type, categoryId: null };
}

/**
 * Another account. A different currency starts the amount over, as on the board: сум are never turned into
 * dollars silently, and dollars type with a comma.
 */
export function chooseAccount(state: ManualEntryState, accountId: string, accounts: readonly Account[]): ManualEntryState {
  const next = accounts.find((account) => account.id === accountId);
  if (!next) return state;
  const sameCurrency = next.currency === entryCurrency(state, accounts);
  return { ...state, accountId, amount: sameCurrency ? state.amount : emptyKeypad() };
}

export function pressEntryKey(state: ManualEntryState, key: KeypadKey, accounts: readonly Account[]): ManualEntryState {
  return { ...state, amount: pressKey(state.amount, key, entryCurrency(state, accounts)) };
}

export function chooseCategory(state: ManualEntryState, categoryId: string): ManualEntryState {
  return { ...state, categoryId };
}

export function chooseDate(state: ManualEntryState, date: LocalDate): ManualEntryState {
  return { ...state, date };
}

export function changeNote(state: ManualEntryState, note: string): ManualEntryState {
  return { ...state, note };
}

function conversionLine(minor: number | null, currency: Currency, rateMinor: number | null): string | null {
  if (!rateMinor) return null;
  if (minor === null) return `1${NBSP}USD = ${formatMinor(rateMinor, 'UZS')}`;
  return currency === 'UZS'
    ? `≈ ${formatMinor(uzsToUsdMinor(minor, rateMinor), 'USD')}`
    : `≈ ${formatMinor(usdToUzsMinor(minor, rateMinor), 'UZS')}`;
}

function dateLabels(date: LocalDate, today: LocalDate): ManualEntryModel['date'] {
  const label = relativeDayLabel(date, today);
  const absolute = dayMonth(date);
  return { label, ariaLabel: label === absolute ? `Дата: ${absolute}` : `Дата: ${label.toLocaleLowerCase('ru-RU')}, ${absolute}` };
}

export function manualEntryModel(state: ManualEntryState, context: EntryContext): ManualEntryModel {
  const currency = entryCurrency(state, context.accounts);
  const minor = keypadToMinor(state.amount, currency);
  const sign = minor === null ? '' : state.type === 'expense' ? MINUS : '+';
  const text = `${sign}${keypadDisplay(state.amount)}`;
  const categories = pickableCategories(context.categories, state.type);
  const category = categories.find((item) => item.id === state.categoryId);

  let saveLabel: string;
  if (minor === null) saveLabel = 'Введите сумму';
  else if (!category) saveLabel = 'Выберите категорию';
  else saveLabel = state.type === 'expense' ? 'Сохранить расход' : 'Сохранить доход';

  return {
    currency,
    amount: {
      text,
      unit: CURRENCY_UNIT[currency],
      tone: minor === null ? 'placeholder' : state.type,
      size: amountFontSize(text),
    },
    conversion: conversionLine(minor, currency, context.rateMinor),
    accounts: visibleAccounts(context.accounts).map((account) => ({
      id: account.id,
      name: account.name,
      balance: formatMinor(account.balanceMinor, account.currency),
      selected: account.id === state.accountId,
    })),
    categories: categories.map((item) => ({ id: item.id, name: item.name, color: item.color, selected: item.id === state.categoryId })),
    categoriesTitle: state.type === 'expense' ? 'Категория расхода' : 'Категория дохода',
    date: dateLabels(state.date, context.today),
    save: { label: saveLabel, ready: minor !== null && !!category },
  };
}

/** The record to write, or null while the amount or the category is missing. */
export function manualEntryRecord(state: ManualEntryState, context: EntryContext): ManualEntryRecord | null {
  const currency = entryCurrency(state, context.accounts);
  const amountMinor = keypadToMinor(state.amount, currency);
  const category = pickableCategories(context.categories, state.type).find((item) => item.id === state.categoryId);
  if (amountMinor === null || !category) return null;

  const account = accountOf(state, context.accounts);
  return {
    type: state.type,
    amountMinor,
    currency,
    ...(account ? { accountId: account.id } : {}),
    categoryId: category.id,
    categoryName: category.name,
    date: state.date,
    note: state.note.trim(),
  };
}

/**
 * The second line of «Записано» (Toast.md: «Кофе · −25 000 сум · Карта»): the note, else the category; the
 * amount with its sign and unit; the account.
 */
export function savedToastDetail(record: ManualEntryRecord, accountName: string | undefined): string {
  const signed = record.type === 'expense' ? -record.amountMinor : record.amountMinor;
  return [record.note || record.categoryName, formatMinor(signed, record.currency, { sign: 'always' }), accountName]
    .filter(Boolean)
    .join(' · ');
}
