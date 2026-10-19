import {
  CURRENCY_UNIT,
  emptyKeypad,
  formatMinor,
  keypadDisplay,
  keypadToMinor,
  pressKey,
  usdToUzsMinor,
  type Currency,
  type KeypadKey,
  type KeypadState,
} from '@/shared/lib/money';

/**
 * «Сколько у вас сейчас денег?» (FT-109, boards «Первый запуск», «Первый запуск · суммы введены»):
 * three rows — cash, card, dollars — and the app's own keypad typing into the chosen one.
 */

export type OpeningSlot = 'cash' | 'card' | 'usd';

interface SlotSpec {
  slot: OpeningSlot;
  name: string;
  caption: string;
  currency: Currency;
}

/** The rows in the board's order; the server sets the same three accounts (POST /api/accounts/opening-balances). */
export const OPENING_SLOTS: readonly SlotSpec[] = [
  { slot: 'cash', name: 'Наличные', caption: 'сумы · наличные', currency: 'UZS' },
  { slot: 'card', name: 'Карта', caption: 'сумы · карта', currency: 'UZS' },
  { slot: 'usd', name: 'Доллары', caption: 'доллары · наличные', currency: 'USD' },
];

export interface OpeningBalancesState {
  active: OpeningSlot;
  values: Record<OpeningSlot, KeypadState>;
}

export interface OpeningBalancesPayload {
  cashMinor: number;
  cardMinor: number;
  usdMinor: number;
}

export interface OpeningBalancesRow {
  slot: OpeningSlot;
  name: string;
  caption: string;
  /** «1 250 000», «420,50», «0». */
  value: string;
  unit: string;
  currency: Currency;
  active: boolean;
  /** Nothing entered yet: the number is a hint and is shown muted. */
  isPlaceholder: boolean;
  ariaLabel: string;
}

/** The rate the note converts dollars at: the user's effective rate (GET /api/rates/usd), if any. */
export interface NoteRate {
  rateMinor: number;
  source: 'cbu' | 'own';
}

const spec = (slot: OpeningSlot) => OPENING_SLOTS.find((item) => item.slot === slot)!;

export function initialOpeningBalances(): OpeningBalancesState {
  return { active: 'cash', values: { cash: emptyKeypad(), card: emptyKeypad(), usd: emptyKeypad() } };
}

export function activeCurrency(state: OpeningBalancesState): Currency {
  return spec(state.active).currency;
}

/** Choosing a row: the first digit typed after it replaces the row's number. */
export function selectOpeningRow(state: OpeningBalancesState, slot: OpeningSlot): OpeningBalancesState {
  const value = state.values[slot];
  return { active: slot, values: { ...state.values, [slot]: { ...value, pristine: value.text !== '' } } };
}

/** A key on the keypad: digits replace a just-chosen row's number, «⌫» and «000» edit it (as on the board). */
export function pressOpeningKey(state: OpeningBalancesState, key: KeypadKey): OpeningBalancesState {
  const currency = activeCurrency(state);
  let value = state.values[state.active];
  if (value.pristine && (key === 'del' || key === '000')) value = { ...value, pristine: false };
  return { ...state, values: { ...state.values, [state.active]: pressKey(value, key, currency) } };
}

function minorOf(state: OpeningBalancesState, slot: OpeningSlot): number {
  return keypadToMinor(state.values[slot], spec(slot).currency) ?? 0;
}

/** What the rows show: the number as typed («420,5» while the cents are being entered). */
export function openingBalancesRows(state: OpeningBalancesState): OpeningBalancesRow[] {
  return OPENING_SLOTS.map(({ slot, name, caption, currency }) => {
    const minor = minorOf(state, slot);
    const value = keypadDisplay(state.values[slot]);
    const active = state.active === slot;
    const unit = CURRENCY_UNIT[currency];
    return {
      slot,
      name,
      caption,
      value,
      unit,
      currency,
      active,
      isPlaceholder: minor === 0,
      ariaLabel: `${name}: ${value} ${unit}${active ? ', вводится сейчас' : '. Ввести'}`,
    };
  });
}

export function openingBalancesPayload(state: OpeningBalancesState): OpeningBalancesPayload {
  return { cashMinor: minorOf(state, 'cash'), cardMinor: minorOf(state, 'card'), usdMinor: minorOf(state, 'usd') };
}

function anyEntered(state: OpeningBalancesState): boolean {
  return OPENING_SLOTS.some(({ slot }) => minorOf(state, slot) > 0);
}

export function startButtonLabel(state: OpeningBalancesState): string {
  return anyEntered(state) ? 'Начать' : 'Начать с нуля';
}

const LATER = '«Ещё» → «Счета и курс доллара»';

/**
 * The one line under the accounts: how to fix the amounts later, or the total. Dollars are added at the
 * effective rate with «≈» and the rate named; without a rate they are not added to сум.
 */
export function openingBalancesNote(state: OpeningBalancesState, rate: NoteRate | null): string {
  if (!anyEntered(state)) return `Не знаете точно — оставьте 0 и поправьте потом: ${LATER}. Там же — другие счета.`;

  const { cashMinor, cardMinor, usdMinor } = openingBalancesPayload(state);
  const uzsMinor = cashMinor + cardMinor;
  const sum = (minor: number) => formatMinor(minor, 'UZS');
  const more = `Другие счета добавите потом: ${LATER}.`;

  if (usdMinor === 0) return `Всего ${sum(uzsMinor)}. ${more}`;
  if (!rate) {
    const parts = [uzsMinor > 0 ? sum(uzsMinor) : null, formatMinor(usdMinor, 'USD')].filter(Boolean).join(' и ');
    return `Всего ${parts} — курса доллара пока нет. ${more}`;
  }

  const total = uzsMinor + usdToUzsMinor(usdMinor, rate.rateMinor);
  const rateText = formatMinor(rate.rateMinor, 'UZS', { unit: false });
  const by = rate.source === 'own' ? 'по своему курсу' : 'по курсу ЦБ';
  return `Всего ≈ ${sum(total)}, доллары — ${by} ${rateText}. ${more}`;
}

/** A key from a computer keyboard (Telegram Desktop): shared with manual entry since FT-113. */
export { keyFromKeyboard } from '@/shared/lib/money';
