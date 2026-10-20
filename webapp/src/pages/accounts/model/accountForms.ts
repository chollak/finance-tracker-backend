import type { Account, AccountPatch, NewAccount } from '@/entities/account';
import type { ApiError } from '@/shared/api';
import type { LocalDate } from '@/shared/lib/dates';
import {
  CURRENCY_UNIT,
  emptyKeypad,
  formatMinor,
  keypadDisplay,
  keypadIsPlaceholder,
  keypadToMinor,
  usdToUzsMinor,
  type Currency,
  type KeypadState,
} from '@/shared/lib/money';
import { openingText } from './accountScreen';

/** The two switches of «Новый счёт», each on its own line so Uzbek labels fit (design-system «Счета и курс»). */
export const KIND_OPTIONS: ReadonlyArray<{ value: 'cash' | 'card'; label: string }> = [
  { value: 'cash', label: 'Наличные' },
  { value: 'card', label: 'Карта' },
];

export const CURRENCY_OPTIONS: ReadonlyArray<{ value: Currency; label: string }> = [
  { value: 'UZS', label: 'Сумы' },
  { value: 'USD', label: 'Доллары' },
];

/** What the amount card of a sheet shows: a typed number in `ink`, a hint in `muted` (design-system). */
export interface AmountView {
  text: string;
  placeholder: boolean;
  unit: string;
}

/** The main button of a sheet: when off, its label says what is missing (Button.md). */
export interface SheetButton {
  label: string;
  ready: boolean;
}

/** A toast after a save: what happened and what exactly. */
export interface Saved {
  title: string;
  detail: string;
}

const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ');

function typedAmount(state: KeypadState, currency: Currency): AmountView {
  return { text: keypadDisplay(state), placeholder: keypadIsPlaceholder(state), unit: CURRENCY_UNIT[currency] };
}

// ── New account ──────────────────────────────────────────────────────────────────────────────────────

export interface NewAccountDraft {
  name: string;
  kind: 'cash' | 'card';
  currency: Currency;
  amount: KeypadState;
}

/** The sheet opens on «Наличные» and «Сумы», as on the board. */
export const NEW_ACCOUNT: NewAccountDraft = { name: '', kind: 'cash', currency: 'UZS', amount: emptyKeypad() };

/**
 * «Новый счёт» (design-system «Счета и курс»): a name, the type and the currency, and «Сколько на нём сейчас» —
 * the opening balance today, not income. Without a name the button asks for one; an empty amount is a zero balance.
 */
export function newAccountView(draft: NewAccountDraft): {
  amount: AmountView;
  button: SheetButton;
  payload: NewAccount | null;
  saved?: Saved;
} {
  const name = cleanName(draft.name);
  const amount = typedAmount(draft.amount, draft.currency);
  if (!name) return { amount, button: { label: 'Введите название', ready: false }, payload: null };
  const openingBalanceMinor = keypadToMinor(draft.amount, draft.currency) ?? 0;
  return {
    amount,
    button: { label: 'Добавить счёт', ready: true },
    payload: { name, kind: draft.kind, currency: draft.currency, openingBalanceMinor },
    saved: { title: 'Счёт добавлен', detail: `${name} · ${formatMinor(openingBalanceMinor, draft.currency)}` },
  };
}

// ── Edit, hide ───────────────────────────────────────────────────────────────────────────────────────

export interface EditAccountDraft {
  name: string;
  currency: Currency;
  /** The balance entered again when the currency changes. */
  amount: KeypadState;
}

export function editAccountDraft(account: Pick<Account, 'name' | 'currency'>): EditAccountDraft {
  return { name: account.name, currency: account.currency, amount: emptyKeypad() };
}

export interface EditAccountView {
  /** «Счёт «Карта»». */
  title: string;
  /** Locked once the account has operations; `changed` — another currency is chosen. */
  currency: { locked: boolean; text: string; changed: boolean };
  /** «2 000 000 сум · на 1 августа»; null while the currency changes (the balance is entered again). */
  initialText: string | null;
  amount: AmountView | null;
  amountNote: string | null;
  button: SheetButton;
  /** What «Сохранить» sends and what «Отменить» sends back; null when nothing changed. */
  change: { patch: AccountPatch; undo: AccountPatch; detail: string } | null;
  /** «Скрыть счёт» (or «Показать счёт» for a hidden one) with what it does; null while the currency changes. */
  hide: { action: 'hide' | 'show'; available: boolean; note: string } | null;
}

const currencyWord = (currency: Currency) => (currency === 'USD' ? 'доллары' : 'сумы');

function hideNote(account: Account, context: { visibleCount: number; rateMinor: number | null }): EditAccountView['hide'] {
  if (account.isHidden) return { action: 'show', available: true, note: 'Счёт снова войдёт в итог и в выбор при записи.' };
  if (context.visibleCount <= 1) {
    return { action: 'hide', available: false, note: 'Это единственный видимый счёт — скрыть его нельзя.' };
  }
  const rest = 'Операции останутся в истории, вернуть счёт можно в любой момент.';
  const inUzs =
    account.currency === 'USD'
      ? context.rateMinor
        ? usdToUzsMinor(account.balanceMinor, context.rateMinor)
        : null
      : account.balanceMinor;
  if (!inUzs) return { action: 'hide', available: true, note: rest };
  const change = inUzs > 0 ? 'уменьшится' : 'увеличится';
  return { action: 'hide', available: true, note: `Итог ${change} на ${formatMinor(Math.abs(inUzs), 'UZS')}. ${rest}` };
}

/**
 * «Изменить» on the account screen (board «Изменить или скрыть счёт»): the name; the currency only while the
 * account has no operations, and then the balance is entered again in it; the opening balance with its date; and
 * «Скрыть счёт», which says how much leaves the total. The last visible account cannot be hidden.
 */
export function editAccountView(
  account: Account & { hasOperations: boolean },
  draft: EditAccountDraft,
  context: { today: LocalDate; visibleCount: number; rateMinor: number | null }
): EditAccountView {
  const name = cleanName(draft.name);
  const currencyChanged = !account.hasOperations && draft.currency !== account.currency;

  const patch: { name?: string; currency?: Currency; openingBalanceMinor?: number } = {};
  const undo: { name?: string; currency?: Currency; openingBalanceMinor?: number } = {};
  const details: string[] = [];
  if (name && name !== account.name) {
    patch.name = name;
    undo.name = account.name;
    details.push(`${account.name} → ${name}`);
  }
  if (currencyChanged) {
    patch.currency = draft.currency;
    patch.openingBalanceMinor = keypadToMinor(draft.amount, draft.currency) ?? 0;
    undo.currency = account.currency;
    undo.openingBalanceMinor = account.openingBalanceMinor;
    details.push(`${details.length ? '' : `${name || account.name} · `}${currencyWord(account.currency)} → ${currencyWord(draft.currency)}`);
  }

  return {
    title: `Счёт «${account.name}»`,
    currency: {
      locked: account.hasOperations,
      text: account.currency === 'USD' ? 'Доллары (USD)' : 'Сумы',
      changed: currencyChanged,
    },
    initialText: currencyChanged ? null : openingText(account, context.today, 'sheet'),
    amount: currencyChanged ? typedAmount(draft.amount, draft.currency) : null,
    amountNote: currencyChanged ? 'Валюта меняется — введите остаток в новой валюте.' : null,
    button: name ? { label: 'Сохранить', ready: true } : { label: 'Введите название', ready: false },
    change: details.length ? { patch: patch as AccountPatch, undo: undo as AccountPatch, detail: details.join(' · ') } : null,
    hide: currencyChanged ? null : hideNote(account, context),
  };
}

// ── Correct the balance ──────────────────────────────────────────────────────────────────────────────

export interface CorrectBalanceView {
  title: string;
  amount: AmountView;
  note: string;
  button: SheetButton;
  /** What to send as `balanceMinor`; null while there is nothing to record. */
  balanceMinor: number | null;
  saved: Saved | null;
}

/**
 * «Сверить остаток» (design-system «Счета и курс»): the person types what is really on the account; until then the
 * balance Daftar has is the grey hint. The difference is recorded as an adjustment, out of analytics — an empty
 * field and the same balance keep the button off.
 */
export function correctBalanceView(account: Pick<Account, 'name' | 'currency' | 'balanceMinor'>, state: KeypadState): CorrectBalanceView {
  const title = `Сколько сейчас на счёте «${account.name}»?`;
  const button = { label: 'Сверить остаток', ready: false };
  const unit = CURRENCY_UNIT[account.currency];

  if (keypadIsPlaceholder(state)) {
    return {
      title,
      amount: { text: formatMinor(account.balanceMinor, account.currency, { unit: false }), placeholder: true, unit },
      note: `Введите остаток, как в банке или в кошельке. Сейчас в Daftar — ${formatMinor(account.balanceMinor, account.currency)}.`,
      button,
      balanceMinor: null,
      saved: null,
    };
  }

  const typed = keypadToMinor(state, account.currency) ?? 0;
  const amount = typedAmount(state, account.currency);
  const difference = typed - account.balanceMinor;
  if (difference === 0) {
    return { title, amount, note: 'Совпадает с Daftar — исправлять нечего.', button, balanceMinor: null, saved: null };
  }
  const signed = formatMinor(difference, account.currency, { sign: 'always' });
  return {
    title,
    amount,
    note: `Разница ${signed} запишется корректировкой — в расходы и аналитику не попадёт.`,
    button: { ...button, ready: true },
    balanceMinor: typed,
    saved: { title: 'Остаток сверен', detail: `${account.name} · корректировка ${signed}` },
  };
}

// ── A failed save ────────────────────────────────────────────────────────────────────────────────────

/** What a sheet says when its save failed; the sheet stays open with what was typed. */
export function accountWriteError(error: Partial<ApiError> | undefined): string {
  if (error?.statusCode === 409) {
    return /currency/i.test(error.serverMessage ?? '')
      ? 'Валюту не изменить: на счёте уже есть операции'
      : 'Счёт с таким названием уже есть — выберите другое';
  }
  if (error?.statusCode === 0) return 'Нет связи. Проверьте её и нажмите ещё раз';
  return 'Не получилось сохранить. Попробуйте ещё раз';
}
