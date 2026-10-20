import { visibleAccounts, type Account } from '@/entities/account';
import { findCategory, pickableCategories, type Category } from '@/entities/category';
import type { TransactionPatch } from '@/entities/transaction';
import { addDays, dayGroupLabel, dayMonth, monthNameOf, parseLocalDate, toLocalDate, type LocalDate } from '@/shared/lib/dates';
import {
  amountFontSize,
  CURRENCY_UNIT,
  formatMinor,
  keypadDisplay,
  keypadToMinor,
  MINUS,
  NBSP,
  recalculationAfterMove,
  usdToUzsMinor,
  uzsToUsdMinor,
  type Currency,
  type KeypadState,
  type Recalculation,
} from '@/shared/lib/money';
import type { PastelColor } from '@/shared/lib/pastel/categoryColors';
import type { PickerAccount, PickerCategory } from '@/shared/ui/pastel';
import type { Transaction } from '@/shared/types';

/**
 * The record sheet (FT-115, boards «Карточка операции», «Компонент · карточка операции», «Карточка · правка
 * суммы», docs/pastel/components/TxnSheet.md): a saved record, changed field by field, each change one patch
 * of the record sent at once. Pure state and what the sheet shows of it; the sheet only renders, the API
 * layer only writes.
 */

export type RecordType = 'expense' | 'income';

/** The record as the sheet edits it. */
export interface SheetRecord {
  id: string;
  type: RecordType;
  /** Integer minor units of `currency`. */
  amountMinor: number;
  currency: Currency;
  categoryId: string | null;
  /** null for a guest, whose records have no account. */
  accountId: string | null;
  date: LocalDate;
  /** The note (`description`), trimmed. */
  note: string;
}

export interface SheetState {
  record: SheetRecord;
  /**
   * «Расход / Доход» was pressed: the type and category before it. Nothing is saved until a category of the
   * new type is chosen; closing the choice brings them back (TxnSheet.md).
   */
  typeChange: { type: RecordType; categoryId: string | null } | null;
  /** «Пересчитать» after a move to an account of another currency. */
  recalculation: Recalculation | null;
}

/** A change of the state and the patch that makes it on the saved record; null — nothing to save. */
export interface SheetChange {
  state: SheetState;
  patch: TransactionPatch | null;
}

/** What the sheet is shown with. */
export interface SheetContext {
  /** The user's categories, hidden ones too: a record keeps showing its category. */
  categories: readonly Category[];
  /** The user's accounts; none for a guest, whose sheet has no «Счёт». */
  accounts: readonly Account[];
  /** The USD rate in effect, сум×100 per 1 USD; null while there is none. */
  rateMinor: number | null;
  /** Today in the user's local time. */
  today: LocalDate;
}

function fold(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

/** The local day of a record: a plain date as is; records saved before FT-100 may keep a full moment. */
function recordDay(date: string): LocalDate {
  if (!date.includes('T')) return date.slice(0, 10);
  const moment = new Date(date);
  return Number.isNaN(moment.getTime()) ? date.slice(0, 10) : toLocalDate(moment);
}

/** The record from the API (or a guest's device); a category without an id is found by its name. */
export function sheetRecordFrom(record: Transaction, categories: readonly Category[]): SheetRecord {
  const type: RecordType = record.type === 'income' ? 'income' : 'expense';
  const categoryId =
    record.categoryId ??
    categories.find((category) => category.type === type && fold(category.name) === fold(record.category ?? ''))?.id ??
    null;

  return {
    id: record.id ?? '',
    type,
    amountMinor: record.amountMinor ?? Math.round(record.amount * 100),
    currency: record.currency ?? 'UZS',
    categoryId,
    accountId: record.accountId ?? null,
    date: recordDay(record.date),
    note: (record.description ?? '').trim(),
  };
}

export function initialSheet(record: SheetRecord): SheetState {
  return { record, typeChange: null, recalculation: null };
}

function withRecord(state: SheetState, change: Partial<SheetRecord>): SheetState {
  return { ...state, record: { ...state.record, ...change } };
}

/** «Расход / Доход»: the other type clears the category, which is chosen next; nothing is saved yet. */
export function chooseType(state: SheetState, type: RecordType): SheetState {
  if (state.record.type === type) return state;
  if (state.typeChange?.type === type) return cancelTypeChange(state);
  return {
    ...withRecord(state, { type, categoryId: null }),
    typeChange: state.typeChange ?? { type: state.record.type, categoryId: state.record.categoryId },
  };
}

/** The choice of a category of the new type was closed: the type and the category come back. */
export function cancelTypeChange(state: SheetState): SheetState {
  if (!state.typeChange) return state;
  return { ...withRecord(state, state.typeChange), typeChange: null };
}

/** A category; after «Расход / Доход» it saves the new type with it, and the meaning of the record follows. */
export function chooseCategory(state: SheetState, categoryId: string): SheetChange {
  const { record } = state;
  if (state.typeChange) {
    return {
      state: { ...withRecord(state, { categoryId }), typeChange: null },
      patch: { type: record.type, categoryId, semanticType: record.type },
    };
  }
  if (categoryId === record.categoryId) return { state, patch: null };
  return { state: withRecord(state, { categoryId }), patch: { categoryId } };
}

/**
 * Another account. The record moves with the account's currency and keeps its number; of another currency
 * the converted amount is offered (`recalculationAfterMove`).
 */
export function chooseAccount(state: SheetState, account: Account, rateMinor: number | null): SheetChange {
  const { record } = state;
  if (account.id === record.accountId) return { state, patch: null };
  return {
    state: {
      ...withRecord(state, { accountId: account.id, currency: account.currency }),
      recalculation: recalculationAfterMove({ ...record, recalculation: state.recalculation }, account.currency, rateMinor),
    },
    patch: { accountId: account.id, currency: account.currency },
  };
}

/** «Пересчитать»: the converted amount becomes the record's. */
export function applyRecalculation(state: SheetState): SheetChange | null {
  if (!state.recalculation) return null;
  const amountMinor = state.recalculation.amountMinor;
  return { state: { ...withRecord(state, { amountMinor }), recalculation: null }, patch: { amountMinor } };
}

/** A new amount from the keypad; it takes the offer to recalculate away. */
export function changeAmount(state: SheetState, amountMinor: number): SheetChange {
  if (amountMinor === state.record.amountMinor) return { state, patch: null };
  return { state: { ...withRecord(state, { amountMinor }), recalculation: null }, patch: { amountMinor } };
}

/** The note, trimmed; it may be cleared. */
export function changeNote(state: SheetState, note: string): SheetChange {
  const trimmed = note.trim();
  if (trimmed === state.record.note) return { state, patch: null };
  return { state: withRecord(state, { note: trimmed }), patch: { description: trimmed } };
}

export function chooseDate(state: SheetState, date: LocalDate): SheetChange {
  if (date === state.record.date) return { state, patch: null };
  return { state: withRecord(state, { date }), patch: { date } };
}

/**
 * Takes back a change the server refused: `before` and `after` are the state around it. Only the fields it
 * changed go back, and only those nothing changed since — a later change, which the server may have taken,
 * stays. A refused new type goes back to the type and category before «Расход / Доход».
 */
export function revertSheetChange(latest: SheetState, before: SheetState, after: SheetState): SheetState {
  const record = { ...latest.record };
  for (const key of Object.keys(before.record) as (keyof SheetRecord)[]) {
    if (before.record[key] !== after.record[key] && latest.record[key] === after.record[key]) {
      Object.assign(record, { [key]: before.record[key] });
    }
  }
  let reverted: SheetState = { ...latest, record };
  if (before.recalculation !== after.recalculation && latest.recalculation === after.recalculation) {
    reverted = { ...reverted, recalculation: before.recalculation };
  }
  if (before.typeChange && !after.typeChange && !latest.typeChange) {
    reverted = cancelTypeChange({ ...reverted, typeChange: before.typeChange });
  }
  return reverted;
}

// ── What the sheet shows ─────────────────────────────────────────────────────────────────────────────

export type SheetFieldKind = 'category' | 'account' | 'date' | 'note';

export interface SheetField {
  kind: SheetFieldKind;
  label: string;
  value: string;
  /** «Выберите», «Добавить»: muted. */
  empty: boolean;
  /** The category's dot. */
  color?: PastelColor;
  aria: string;
}

export interface RecordSheetModel {
  type: RecordType;
  /** Names the dialog: «Операция: Кафе, −145 000 сум». */
  dialogLabel: string;
  amount: {
    /** «−145 000», «+300,00». */
    text: string;
    unit: string;
    tone: RecordType;
    /** 32px; a longer amount gets 26px instead of wrapping. */
    large: boolean;
    aria: string;
  };
  recalculation: { note: string; label: string } | null;
  fields: SheetField[];
}

function signedAmount(record: Pick<SheetRecord, 'type' | 'amountMinor' | 'currency'>): string {
  return `${record.type === 'expense' ? MINUS : '+'}${formatMinor(record.amountMinor, record.currency, { sign: 'none', unit: false })}`;
}

/** «−145 000 сум», as toasts and the quick choice name an amount. */
function amountWithUnit(record: SheetRecord): string {
  return `${signedAmount(record)}${NBSP}${CURRENCY_UNIT[record.currency]}`;
}

/** «Сегодня, 14 октября», «Вчера, 13 октября», «Понедельник, 12 октября». */
function dateLabel(date: LocalDate, today: LocalDate): string {
  if (date === today) return `Сегодня, ${dayMonth(date)}`;
  if (date === addDays(today, -1)) return `Вчера, ${dayMonth(date)}`;
  return dayGroupLabel(date, today);
}

function categoryName(id: string | null, context: SheetContext): string {
  return findCategory(context.categories, id ?? undefined)?.name ?? 'Без категории';
}

function field(kind: SheetFieldKind, label: string, value: string | null, empty: string, color?: PastelColor): SheetField {
  const shown = value ?? empty;
  return { kind, label, value: shown, empty: value === null, ...(color ? { color } : {}), aria: `${label}: ${shown}. Изменить` };
}

export function recordSheetModel(state: SheetState, context: SheetContext): RecordSheetModel {
  const { record } = state;
  const category = findCategory(context.categories, record.categoryId ?? undefined);
  const text = signedAmount(record);
  const unit = CURRENCY_UNIT[record.currency];
  const hasAccounts = context.accounts.length > 0;
  const account = context.accounts.find((item) => item.id === record.accountId);

  return {
    type: record.type,
    dialogLabel: `Операция: ${category?.name ?? 'без категории'}, ${text} ${unit}`,
    amount: { text, unit, tone: record.type, large: text.length <= 11, aria: `Сумма: ${text} ${unit}. Изменить` },
    recalculation: state.recalculation
      ? {
          note: 'Валюта сменилась, число осталось прежним',
          label: `Пересчитать: ${formatMinor(state.recalculation.amountMinor, record.currency)}`,
        }
      : null,
    fields: [
      field('category', 'Категория', category?.name ?? null, 'Выберите', category?.color),
      ...(hasAccounts ? [field('account', 'Счёт', account?.name ?? null, 'Выберите')] : []),
      field('date', 'Дата', dateLabel(record.date, context.today), ''),
      field('note', 'Заметка', record.note || null, 'Добавить'),
    ],
  };
}

/** The category choice of the sheet (Picker.md): the categories of the record's type, the current one marked. */
export function categoryChoices(
  state: SheetState,
  context: SheetContext
): { title: 'Категория расхода' | 'Категория дохода'; categories: PickerCategory[]; selectedId: string | null } {
  const { type, categoryId } = state.record;
  return {
    title: type === 'expense' ? 'Категория расхода' : 'Категория дохода',
    categories: pickableCategories(context.categories, type).map(({ id, name, color }) => ({ id, name, color })),
    selectedId: categoryId,
  };
}

/** The account choice: the visible accounts with their balances. */
export function accountChoices(context: SheetContext): PickerAccount[] {
  return visibleAccounts(context.accounts).map((account) => ({
    id: account.id,
    name: account.name,
    balance: formatMinor(account.balanceMinor, account.currency),
  }));
}

// ── The amount on the keypad ─────────────────────────────────────────────────────────────────────────

export interface AmountEntryModel {
  /** «−145 000»; «0» before anything is typed. */
  text: string;
  unit: string;
  tone: 'placeholder' | RecordType;
  /** The current amount before the first key: pale, the first key replaces it. */
  pale: boolean;
  /** Shrinks instead of wrapping (amount-xl, 40, 32px). */
  size: 50 | 40 | 32;
  /** «≈ 11,46 USD», «1 USD = 12 650 сум»; null without a rate. */
  conversion: string | null;
  save: { label: 'Готово' | 'Введите сумму'; ready: boolean };
}

function conversionLine(minor: number | null, currency: Currency, rateMinor: number | null): string | null {
  if (!rateMinor) return null;
  if (minor === null) return `1${NBSP}USD = ${formatMinor(rateMinor, 'UZS')}`;
  return currency === 'UZS'
    ? `≈ ${formatMinor(uzsToUsdMinor(minor, rateMinor), 'USD')}`
    : `≈ ${formatMinor(usdToUzsMinor(minor, rateMinor), 'UZS')}`;
}

export function amountEntryModel(record: SheetRecord, keypad: KeypadState, rateMinor: number | null): AmountEntryModel {
  const minor = keypadToMinor(keypad, record.currency);
  const sign = minor === null ? '' : record.type === 'expense' ? MINUS : '+';
  const text = `${sign}${keypadDisplay(keypad)}`;
  return {
    text,
    unit: CURRENCY_UNIT[record.currency],
    tone: minor === null ? 'placeholder' : record.type,
    pale: keypad.pristine,
    size: amountFontSize(text),
    conversion: conversionLine(minor, record.currency, rateMinor),
    save: minor === null ? { label: 'Введите сумму', ready: false } : { label: 'Готово', ready: true },
  };
}

// ── What the toasts and the quick choice say ─────────────────────────────────────────────────────────

/** «Удалено / Кафе · −145 000 сум» (Toast.md). */
export function deletedToast(record: SheetRecord, context: SheetContext): { title: string; detail: string } {
  return { title: 'Удалено', detail: `${categoryName(record.categoryId, context)} · ${amountWithUnit(record)}` };
}

/** «Категория изменена / Кафе → Продукты», after the quick choice from a row (Toast.md). */
export function categoryChangedToast(fromId: string | null, toId: string, context: SheetContext): { title: string; detail: string } {
  return { title: 'Категория изменена', detail: `${categoryName(fromId, context)} → ${categoryName(toId, context)}` };
}

/**
 * The days a screen lists records of — a category of a month (FT-121, board «Аналитика · категория «Кафе»»): a
 * record whose date the sheet moved out of them leaves that list, and says so as the sheet closes.
 */
export interface RecordPeriod {
  /** YYYY-MM-DD, inclusive. */
  from: LocalDate;
  to: LocalDate;
}

export const isInPeriod = (date: LocalDate, period: RecordPeriod): boolean => date >= period.from && date <= period.to;

/** «Дата изменена / Перенесено на 2 сентября · −145 000 сум»: the record left the screen's days (board `pendingRedate`). */
export function movedToast(record: SheetRecord): { title: string; detail: string } {
  const { month, day } = parseLocalDate(record.date);
  return { title: 'Дата изменена', detail: `Перенесено на ${day}${NBSP}${monthNameOf(month)} · ${amountWithUnit(record)}` };
}

/** The line under the quick choice's title: «Обед с командой · −145 000 сум» (Picker.md). */
export function quickPickerContext(record: SheetRecord): string {
  return record.note ? `${record.note} · ${amountWithUnit(record)}` : amountWithUnit(record);
}
