import type { Account, NewMove } from '@/entities/account';
import {
  CURRENCY_UNIT,
  convertMinor,
  formatMinor,
  keypadDisplay,
  keypadFromMinor,
  keypadToMinor,
  pressShownKey,
  usdToUzsMinor,
  type Currency,
  type KeypadKey,
} from '@/shared/lib/money';
import type { PickerAccount } from '@/shared/ui/pastel';

/** An account as the form needs it: the visible ones, in their order. */
export type TransferAccount = Pick<Account, 'id' | 'name' | 'kind' | 'currency' | 'balanceMinor'>;

export interface TransferContext {
  /** The visible accounts: a hidden one is not offered for a move (design-system «Скрыть, а не удалить»). */
  accounts: readonly TransferAccount[];
  /** The Central Bank rate «Получаю» is first counted at; null before the bank has answered once. */
  cbuRateMinor: number | null;
}

/** «Отдаю» (or the single amount of a transfer) and «Получаю». */
export type TransferField = 'out' | 'in';

export interface TransferState {
  fromId: string;
  toId: string;
  /** Keypad text of the amount that leaves «Откуда» / «Отдаю», in its currency. */
  out: string;
  /** Keypad text of «Получаю»; it counts once typed into (`inTouched`), until then the Central Bank amount does. */
  in: string;
  inTouched: boolean;
  field: TransferField;
  /** The active field shows a number not typed in this go: the first digit replaces it, «⌫» and «000» edit it. */
  fresh: boolean;
}

export interface TransferAmountView {
  /** «500 000», «101,19»; «0» while empty. */
  text: string;
  /** Muted: nothing entered yet, or «Получаю» still counted at the Central Bank rate. */
  placeholder: boolean;
  unit: string;
}

interface SideView {
  label: string;
  accountName: string;
  /** «Откуда: счёт Карта, 3 180 000 сум. Выбрать другой счёт». */
  accountAria: string;
  /** Active field of an exchange: the ring 2px `ink`; a transfer has one field and no ring. */
  active: boolean;
  ring: boolean;
  amountAria: string;
  note: string;
}

export interface TransferView {
  kind: 'transfer' | 'exchange';
  title: 'Перевод' | 'Обмен';
  from: SideView & { amount: TransferAmountView; warning: boolean };
  /** `amount` only for an exchange; `byCbu` — the label «по курсу ЦБ» beside «Получаю». */
  to: SideView & { amount: TransferAmountView | null; byCbu: boolean };
  /** «Курс сделки: 12 800 сум за $1» and the difference with the Central Bank, once «Получаю» is typed. */
  deal: { title: string; text: string } | null;
  /** The one line under the cards: the move is not an expense. */
  note: string;
  /** The keypad types in the active field's currency: «000» for сум, a comma for dollars. */
  keypadCurrency: Currency;
  button: { label: string; ready: boolean };
  picker: Record<'from' | 'to', { title: string; accounts: PickerAccount[]; selectedId: string }>;
  /** Said by a screen reader as it changes. */
  liveText: string;
  payload: NewMove | null;
  /** The toast after the move is written. */
  saved: { title: string; detail: string } | null;
}

function accountOf(context: TransferContext, id: string): TransferAccount | undefined {
  return context.accounts.find((account) => account.id === id);
}

/** The counterpart a form opens with: a dollar account exchanges, a сум account transfers (board, design-system). */
function counterpart(accounts: readonly TransferAccount[], from: TransferAccount): TransferAccount {
  const others = accounts.filter((account) => account.id !== from.id);
  const exchange = from.currency === 'USD';
  return others.find((account) => (account.currency !== from.currency) === exchange) ?? others[0];
}

/**
 * The form as it opens (TransferForm.md): from the account it was opened on, or — from the list — from the card
 * (the first visible card account, else the first visible account); null while fewer than two accounts are visible.
 */
export function startTransfer(accounts: readonly TransferAccount[], fromId: string | null | undefined): TransferState | null {
  if (accounts.length < 2) return null;
  const from =
    accounts.find((account) => account.id === fromId) ??
    accounts.find((account) => account.kind === 'card') ??
    accounts[0];
  const to = counterpart(accounts, from);
  return { fromId: from.id, toId: to.id, out: '', in: '', inTouched: false, field: 'out', fresh: true };
}

interface Amounts {
  from: TransferAccount;
  to: TransferAccount;
  exchange: boolean;
  outMinor: number;
  /** «Получаю» at the Central Bank rate; null with no rate. Equal to `outMinor` for a transfer. */
  autoInMinor: number | null;
  inMinor: number;
}

function amounts(state: TransferState, context: TransferContext): Amounts | null {
  const from = accountOf(context, state.fromId);
  const to = accountOf(context, state.toId);
  if (!from || !to) return null;
  const exchange = from.currency !== to.currency;
  const outMinor = keypadToMinor({ text: state.out, pristine: false }, from.currency) ?? 0;
  const autoInMinor = exchange ? convertMinor(outMinor, from.currency, to.currency, context.cbuRateMinor) : outMinor;
  const inMinor = !exchange
    ? outMinor
    : state.inTouched
      ? (keypadToMinor({ text: state.in, pristine: false }, to.currency) ?? 0)
      : (autoInMinor ?? 0);
  return { from, to, exchange, outMinor, autoInMinor, inMinor };
}

/** The keypad text of an amount, to edit it as the next field's own number. */
const keypadText = (minor: number | null, currency: Currency) => (minor ? keypadFromMinor(minor, currency).text : '');

export function pressTransferKey(state: TransferState, key: KeypadKey, context: TransferContext): TransferState {
  const values = amounts(state, context);
  if (!values) return state;
  const field = values.exchange ? state.field : 'out';
  const currency = field === 'out' ? values.from.currency : values.to.currency;
  const typed = pressShownKey({ text: field === 'out' ? state.out : state.in, pristine: state.fresh }, key, currency).text;
  return field === 'out' ? { ...state, field, out: typed, fresh: false } : { ...state, field, in: typed, inTouched: true, fresh: false };
}

/**
 * A press on an amount makes it active. «Получаю» not typed yet takes the Central Bank amount as its own number:
 * «⌫» edits it, the first digit replaces it.
 */
export function focusTransferField(state: TransferState, field: TransferField, context: TransferContext): TransferState {
  const values = amounts(state, context);
  if (!values || (field === 'in' && !values.exchange)) return state;
  if (field === 'out' || state.inTouched) return { ...state, field, fresh: true };
  return { ...state, field, fresh: true, in: keypadText(values.autoInMinor, values.to.currency) };
}

/** «Поменять местами»: an exchange keeps its deal the other way round — what was received is now given. */
export function swapTransfer(state: TransferState, context: TransferContext): TransferState {
  const values = amounts(state, context);
  if (!values) return state;
  const swapped = { ...state, fromId: state.toId, toId: state.fromId, field: 'out' as const, fresh: true };
  if (!values.exchange) return swapped;
  return {
    ...swapped,
    out: state.inTouched ? state.in : keypadText(values.autoInMinor, values.to.currency),
    in: state.inTouched ? state.out : '',
  };
}

/**
 * Another account from the picker: «Получаю» is counted at the Central Bank rate again; when «Отдаю» changes
 * currency its amount is typed again (money never changes currency silently).
 */
export function chooseTransferAccount(state: TransferState, side: 'from' | 'to', id: string, context: TransferContext): TransferState {
  const chosen = accountOf(context, id);
  const other = side === 'from' ? state.toId : state.fromId;
  if (!chosen || id === other) return state;
  const before = accountOf(context, state.fromId);
  const next: TransferState = { ...state, field: 'out', fresh: true, inTouched: false, in: '' };
  if (side === 'to') return { ...next, toId: id };
  return { ...next, fromId: id, out: before?.currency === chosen.currency ? state.out : '' };
}

const money = (minor: number, currency: Currency) => formatMinor(minor, currency);
/** A rate in whole сум for $1, said as the rate row says it: «12 800». */
const rateText = (sumPerDollar: number) => formatMinor(sumPerDollar * 100, 'UZS', { unit: false });

/** The сум and dollar sides of an exchange, whichever way it goes. */
function exchangeSides({ from, outMinor, inMinor }: Amounts): { uzsMinor: number; usdMinor: number } {
  return { uzsMinor: from.currency === 'UZS' ? outMinor : inMinor, usdMinor: from.currency === 'USD' ? outMinor : inMinor };
}

/** The deal rate in whole сум for $1 (the server keeps it exact: `dealRateMinor`); null without both amounts. */
function dealRate(values: Amounts): number | null {
  const { uzsMinor, usdMinor } = exchangeSides(values);
  return uzsMinor > 0 && usdMinor > 0 ? Math.round(uzsMinor / usdMinor) : null;
}

function dealOf(values: Amounts, cbuRateMinor: number | null): TransferView['deal'] {
  const rate = dealRate(values);
  if (rate === null) return null;
  const { from } = values;
  const { uzsMinor, usdMinor } = exchangeSides(values);
  const title = `Курс сделки: ${rateText(rate)} сум за $1`;
  if (cbuRateMinor === null) return { title, text: 'Курса ЦБ пока нет — сравнить не с чем.' };
  const atCbu = usdToUzsMinor(usdMinor, cbuRateMinor);
  // Lost against the Central Bank: paid more сум for the dollars, or got fewer сум for them
  const lost = from.currency === 'UZS' ? uzsMinor - atCbu : atCbu - uzsMinor;
  if (Math.round(lost / 100) === 0) return { title, text: 'Ровно по курсу ЦБ.' };
  const words = lost > 0 ? 'не в вашу пользу' : 'в вашу пользу';
  return { title, text: `По курсу ЦБ — ${money(atCbu, 'UZS')}, разница ${money(Math.abs(lost), 'UZS')} ${words}.` };
}

/**
 * The transfer and exchange form (FT-119, boards «Перевод между счетами», «Обмен сумы → доллары», TransferForm.md).
 * One currency — «Перевод», «Откуда / Куда», one amount. Different currencies — «Обмен», «Отдаю / Получаю»: «Получаю»
 * is first the amount at the Central Bank rate, muted and labelled «по курсу ЦБ», and can be sent as it is; typed,
 * it gives the deal rate and the difference with the Central Bank in words. Under each amount — what becomes of the
 * account; more than is on it keeps the button off. The line under the cards says the move is not an expense.
 */
export function transferView(state: TransferState, context: TransferContext): TransferView {
  const values = amounts(state, context);
  if (!values) throw new Error('The transfer form needs both of its accounts among the visible ones');
  const { from, to, exchange, outMinor, autoInMinor, inMinor } = values;
  const outActive = !exchange || state.field === 'out';
  const byCbu = exchange && !state.inTouched && autoInMinor !== null;
  const over = outMinor > from.balanceMinor;
  const ready = outMinor > 0 && inMinor > 0 && !over;
  const deal = exchange && state.inTouched ? dealOf(values, context.cbuRateMinor) : null;

  const outText = keypadDisplay({ text: state.out, pristine: false });
  const fromAmount: TransferAmountView = { text: outText, placeholder: outMinor === 0, unit: CURRENCY_UNIT[from.currency] };
  const toAmount: TransferAmountView | null = !exchange
    ? null
    : state.inTouched
      ? { text: keypadDisplay({ text: state.in, pristine: false }), placeholder: inMinor === 0, unit: CURRENCY_UNIT[to.currency] }
      : { text: autoInMinor ? formatMinor(autoInMinor, to.currency, { unit: false }) : '0', placeholder: true, unit: CURRENCY_UNIT[to.currency] };

  let note = 'Перевод не попадает в расходы и аналитику — деньги просто меняют счёт.';
  if (exchange) {
    note = state.inTouched
      ? 'Обмен не попадает в расходы и аналитику. Курс сделки сохранится в записи.'
      : 'Введите, сколько пришло на самом деле, — запишу точный курс. Обмен не попадает в расходы и аналитику.';
  }

  let label = 'Введите сумму';
  if (ready) label = `${exchange ? 'Обменять' : 'Перевести'} ${money(outMinor, from.currency)}`;
  else if (over) label = 'Не хватает денег на счёте';
  else if (exchange && outMinor > 0) label = 'Введите, сколько получили';

  const options = (excluded: string): PickerAccount[] =>
    context.accounts
      .filter((account) => account.id !== excluded)
      .map((account) => ({ id: account.id, name: account.name, balance: money(account.balanceMinor, account.currency) }));

  const payload: NewMove | null = !ready
    ? null
    : exchange
      ? { kind: 'exchange', fromAccountId: from.id, toAccountId: to.id, fromAmountMinor: outMinor, toAmountMinor: inMinor }
      : { kind: 'transfer', fromAccountId: from.id, toAccountId: to.id, amountMinor: outMinor };

  const shownRate = deal ? dealRate(values) : null;

  return {
    kind: exchange ? 'exchange' : 'transfer',
    title: exchange ? 'Обмен' : 'Перевод',
    from: {
      label: exchange ? 'Отдаю' : 'Откуда',
      accountName: from.name,
      accountAria: `${exchange ? 'Отдаю со счёта' : 'Откуда: счёт'} ${from.name}, ${money(from.balanceMinor, from.currency)}. Выбрать другой счёт`,
      active: outActive,
      ring: exchange && outActive,
      amount: fromAmount,
      amountAria: `${exchange ? 'Отдаю' : 'Сумма'}: ${money(outMinor, from.currency)}${outActive ? ', вводится сейчас' : '. Ввести'}`,
      note: over
        ? `На счёте «${from.name}» только ${money(from.balanceMinor, from.currency)} — меньше суммы`
        : `На счёте ${money(from.balanceMinor, from.currency)}${outMinor > 0 ? ` · останется ${money(from.balanceMinor - outMinor, from.currency)}` : ''}`,
      warning: over,
    },
    to: {
      label: exchange ? 'Получаю' : 'Куда',
      accountName: to.name,
      accountAria: `${exchange ? 'Получаю на счёт' : 'Куда: счёт'} ${to.name}. Выбрать другой счёт`,
      active: !outActive,
      ring: !outActive,
      amount: toAmount,
      amountAria: `Получаю: ${money(inMinor, to.currency)}${byCbu ? ', посчитано по курсу ЦБ' : ''}${outActive ? '. Ввести' : ', вводится сейчас'}`,
      byCbu,
      note: `На счёте ${money(to.balanceMinor, to.currency)}${inMinor > 0 ? ` · станет ${money(to.balanceMinor + inMinor, to.currency)}` : ''}`,
    },
    deal,
    note,
    keypadCurrency: outActive ? from.currency : to.currency,
    button: { label, ready },
    picker: {
      from: { title: exchange ? 'Отдаю со счёта' : 'Откуда', accounts: options(to.id), selectedId: from.id },
      to: { title: exchange ? 'Получаю на счёт' : 'Куда', accounts: options(from.id), selectedId: to.id },
    },
    liveText: over
      ? `Не хватает денег: на счёте «${from.name}» ${money(from.balanceMinor, from.currency)}`
      : shownRate
        ? `Курс сделки ${rateText(shownRate)} сум за доллар`
        : '',
    payload,
    saved: !payload
      ? null
      : exchange
        ? { title: 'Обмен записан', detail: `${money(outMinor, from.currency)} → ${money(inMinor, to.currency)}` }
        : { title: 'Перевод записан', detail: `${from.name} → ${to.name} · ${money(outMinor, from.currency)}` },
  };
}
