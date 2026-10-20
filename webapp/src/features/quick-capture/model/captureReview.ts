import { visibleAccounts, type Account } from '@/entities/account';
import { pickableCategories, type Category } from '@/entities/category';
import type { TransactionPatch } from '@/entities/transaction';
import { addDays, parseLocalDate, type LocalDate } from '@/shared/lib/dates';
import { CURRENCY_UNIT, formatMinor, MINUS, NBSP, recalculationAfterMove, type Currency, type Recalculation } from '@/shared/lib/money';
import type { PastelColor } from '@/shared/lib/pastel/categoryColors';
import type { PickerAccount, PickerCategory } from '@/shared/ui/pastel';
import { pluralRu } from '@/shared/lib/plural';
import type { CapturedTransaction, QuickCaptureResult } from './types';

/**
 * The review of the records one phrase made (FT-114, boards «Проверка записей» and «Проверка · категория
 * под вопросом»). The capture has already saved them (POST /api/quick-capture has no draft), so the review
 * is a list of saved records the user checks: the AI's guess of a category waits for a confirmation, and
 * every change is a patch of the saved record. Pure state and what the screen shows of it.
 */

export interface ReviewItem {
  id: string;
  type: 'expense' | 'income';
  amountMinor: number;
  currency: Currency;
  note: string;
  categoryId: string | null;
  /** The category is the AI's guess (`assumptions`: one the AI chose itself, FT-138), not confirmed yet. */
  guessed: boolean;
  accountId: string | null;
  date: LocalDate;
  /** «45» read as 45 000: what was written and the amount it became. */
  thousands: { written: string; amountMinor: number } | null;
  /** After an account of another currency the number stayed; this offers it converted (design-system). */
  conversion: Recalculation | null;
  /** Taken out with «×» (deleted, «Отменить» brings it back). */
  removed: boolean;
}

export interface ReviewSession {
  /** The phrase as sent. */
  text: string;
  items: ReviewItem[];
}

export interface ReviewContext {
  categories: readonly Category[];
  accounts: readonly Account[];
  /** USD rate in effect, сум×100 per 1 USD; null while there is none. */
  rateMinor: number | null;
  today: LocalDate;
}

/** A change of the session and the patch of the saved record that makes it on the server. */
export interface ReviewChange {
  session: ReviewSession;
  patch: TransactionPatch;
}

function fold(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

function toItem(record: CapturedTransaction, categories: readonly Category[]): ReviewItem {
  const currency: Currency = record.currency ?? 'UZS';
  const amountMinor = record.amountMinor ?? Math.round(record.amount * 100);
  // A server from before FT-114 sends only the name: names are unique per type
  const categoryId =
    record.categoryId ??
    categories.find((category) => category.type === record.type && fold(category.name) === fold(record.category))?.id ??
    null;
  const thousands = record.assumptions?.find((assumption) => assumption.kind === 'thousands');

  return {
    id: record.id,
    type: record.type,
    amountMinor,
    currency,
    note: (record.description ?? record.merchant ?? '').trim(),
    categoryId,
    guessed: record.assumptions?.some((assumption) => assumption.kind === 'category') ?? false,
    accountId: record.accountId ?? null,
    date: record.date.slice(0, 10),
    thousands: thousands ? { written: thousands.written, amountMinor: Math.round(thousands.amount * 100) } : null,
    conversion: null,
    removed: !!record.deletedAt,
  };
}

export function reviewSessionFrom(result: QuickCaptureResult, categories: readonly Category[]): ReviewSession {
  return { text: result.text, items: result.transactions.map((record) => toItem(record, categories)) };
}

export function liveItems(session: ReviewSession): ReviewItem[] {
  return session.items.filter((item) => !item.removed);
}

function update(session: ReviewSession, id: string, change: (item: ReviewItem) => ReviewItem): ReviewSession {
  return { ...session, items: session.items.map((item) => (item.id === id ? change(item) : item)) };
}

/**
 * Takes back one change the server refused: `before` and `after` are the item around that change. Only the
 * fields it changed go back, and only those nothing has changed since — a later change, which the server may
 * have taken, stays on the screen.
 */
export function revertChange(session: ReviewSession, before: ReviewItem, after: ReviewItem): ReviewSession {
  return update(session, before.id, (latest) => {
    const reverted = { ...latest };
    for (const key of Object.keys(before) as (keyof ReviewItem)[]) {
      if (before[key] !== after[key] && latest[key] === after[key]) Object.assign(reverted, { [key]: before[key] });
    }
    return reverted;
  });
}

export function findItem(session: ReviewSession, id: string): ReviewItem | undefined {
  return session.items.find((item) => item.id === id);
}

/** A press in the category picker: the guessed category confirms it, another one changes it. */
export function chooseCategory(session: ReviewSession, id: string, categoryId: string): ReviewChange {
  return { session: update(session, id, (item) => ({ ...item, categoryId, guessed: false })), patch: { categoryId } };
}

/**
 * Another account. Of the same currency it just moves the record; of another one the number stays (money
 * never changes currency silently) and the converted amount is offered; back to the first currency the
 * number is the one written, so nothing is offered (`recalculationAfterMove`, the same rule as the record sheet).
 */
export function chooseAccount(session: ReviewSession, id: string, account: Account, rateMinor: number | null): ReviewChange {
  const next = update(session, id, (item) => ({
    ...item,
    accountId: account.id,
    currency: account.currency,
    conversion: recalculationAfterMove({ ...item, recalculation: item.conversion }, account.currency, rateMinor),
  }));
  return { session: next, patch: { accountId: account.id, currency: account.currency } };
}

/** «Пересчитать»: the converted amount becomes the record's. */
export function applyConversion(session: ReviewSession, id: string): ReviewChange | null {
  const item = findItem(session, id);
  if (!item?.conversion) return null;
  const amountMinor = item.conversion.amountMinor;
  return { session: update(session, id, (current) => ({ ...current, amountMinor, conversion: null })), patch: { amountMinor } };
}

export function chooseDate(session: ReviewSession, id: string, date: LocalDate): ReviewChange {
  return { session: update(session, id, (item) => ({ ...item, date })), patch: { date } };
}

export function removeItem(session: ReviewSession, id: string): ReviewSession {
  return update(session, id, (item) => ({ ...item, removed: true }));
}

export function restoreItem(session: ReviewSession, id: string): ReviewSession {
  return update(session, id, (item) => ({ ...item, removed: false }));
}

// ── What the screen shows ────────────────────────────────────────────────────────────────────────────

const SHORT_MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** «Сегодня», «Вчера, 13 окт», «11 окт»; a day of another year carries the year. */
function reviewDateLabel(date: LocalDate, today: LocalDate): string {
  if (date === today) return 'Сегодня';
  const { year, month, day } = parseLocalDate(date);
  const short = `${day} ${SHORT_MONTHS[month - 1]}${year === parseLocalDate(today).year ? '' : ` ${year}`}`;
  return date === addDays(today, -1) ? `Вчера, ${short}` : short;
}

export interface ReviewItemView {
  id: string;
  /** «−25 000», «+300,00». */
  amount: string;
  unit: string;
  tone: 'expense' | 'income';
  note: string;
  category: { name: string; color: PastelColor; guessed: boolean; aria: string };
  account: { name: string; aria: string };
  date: { label: string; aria: string };
  removeAria: string;
  /** ««45» понял как 45 000 сум» while the amount is the one read so. */
  thousands: string | null;
  conversion: { note: string; label: string } | null;
}

export interface ReviewModel {
  /** The phrase in quotes. */
  text: string;
  /** «3 операции · 1 проверить», «Ничего не осталось». */
  summary: string;
  items: ReviewItemView[];
  save: { label: string; ready: boolean };
}

const OPERATIONS: [string, string, string] = ['операция', 'операции', 'операций'];

function categoryOf(item: ReviewItem, context: ReviewContext): { name: string; color: PastelColor } {
  const category = item.categoryId ? context.categories.find((candidate) => candidate.id === item.categoryId) : undefined;
  return category ? { name: category.name, color: category.color } : { name: 'Без категории', color: 'mist' };
}

function signed(item: ReviewItem): string {
  const body = formatMinor(item.amountMinor, item.currency, { sign: 'none', unit: false });
  return `${item.type === 'expense' ? MINUS : '+'}${body}`;
}

function itemView(item: ReviewItem, context: ReviewContext): ReviewItemView {
  const category = categoryOf(item, context);
  const account = context.accounts.find((candidate) => candidate.id === item.accountId)?.name ?? 'Счёт';
  const date = reviewDateLabel(item.date, context.today);
  const amount = signed(item);
  const unit = CURRENCY_UNIT[item.currency];
  // Only while the amount is still the one read so: a converted amount or another currency says otherwise
  const thousands =
    item.thousands && item.currency === 'UZS' && item.amountMinor === item.thousands.amountMinor
      ? `«${item.thousands.written}» понял как ${formatMinor(item.amountMinor, 'UZS')}`
      : null;

  return {
    id: item.id,
    amount,
    unit,
    tone: item.type,
    note: item.note,
    category: {
      ...category,
      guessed: item.guessed,
      aria: `Категория: ${category.name}${item.guessed ? ', не уверен — проверьте' : ''}. Изменить`,
    },
    account: { name: account, aria: `Счёт: ${account}. Изменить` },
    date: { label: date, aria: `Дата: ${date}. Изменить` },
    removeAria: `Убрать: ${category.name}, ${amount} ${unit}`,
    thousands,
    conversion: item.conversion
      ? {
          note: 'Валюта сменилась, число осталось прежним',
          label: `Пересчитать: ${formatMinor(item.conversion.amountMinor, item.currency)}`,
        }
      : null,
  };
}

export function reviewModel(session: ReviewSession, context: ReviewContext): ReviewModel {
  const live = liveItems(session);
  const count = live.length;
  const guessed = live.filter((item) => item.guessed).length;

  return {
    text: `«${session.text}»`,
    summary: count === 0 ? 'Ничего не осталось' : `${count} ${pluralRu(count, ...OPERATIONS)}${guessed ? ` · ${guessed} проверить` : ''}`,
    items: live.map((item) => itemView(item, context)),
    save:
      count === 0
        ? { label: 'Нечего сохранять', ready: false }
        : { label: `Сохранить ${count} ${pluralRu(count, 'операцию', 'операции', 'операций')}`, ready: true },
  };
}

/** The category picker of an item (Picker.md): its type's categories, the current one, the guess marked. */
export function categoryChoices(
  session: ReviewSession,
  id: string,
  context: ReviewContext
): { title: string; categories: PickerCategory[]; selectedId: string | null; guessedId: string | null } {
  const item = findItem(session, id);
  const type = item?.type ?? 'expense';
  return {
    title: type === 'expense' ? 'Категория расхода' : 'Категория дохода',
    categories: pickableCategories(context.categories, type).map(({ id: categoryId, name, color }) => ({ id: categoryId, name, color })),
    selectedId: item?.categoryId ?? null,
    guessedId: item?.guessed ? item.categoryId : null,
  };
}

/** The account picker: the visible accounts with their balances. */
export function accountChoices(context: ReviewContext): PickerAccount[] {
  return visibleAccounts(context.accounts).map((account) => ({
    id: account.id,
    name: account.name,
    balance: formatMinor(account.balanceMinor, account.currency),
  }));
}

function amountWithUnit(item: ReviewItem): string {
  return `${signed(item)}${NBSP}${CURRENCY_UNIT[item.currency]}`;
}

/** «Убрано / Кафе · −25 000 сум» after «×» (Toast.md). */
export function removedToast(item: ReviewItem, context: ReviewContext): { title: string; detail: string } {
  return { title: 'Убрано', detail: `${categoryOf(item, context).name} · ${amountWithUnit(item)}` };
}

/**
 * «Записано» after «Сохранить»: one record as Toast.md names it («Кофе · −25 000 сум · Карта»), several by
 * their count and categories («3 операции · Кафе, Транспорт, Фриланс»).
 */
export function capturedToast(session: ReviewSession, context: ReviewContext): { title: string; detail: string } {
  const live = liveItems(session);
  if (live.length === 1) {
    const [item] = live;
    const account = context.accounts.find((candidate) => candidate.id === item.accountId)?.name;
    return {
      title: 'Записано',
      detail: [item.note || categoryOf(item, context).name, amountWithUnit(item), account].filter(Boolean).join(' · '),
    };
  }
  const names = [...new Set(live.map((item) => categoryOf(item, context).name))].join(', ');
  return { title: 'Записано', detail: `${live.length} ${pluralRu(live.length, ...OPERATIONS)} · ${names}` };
}
