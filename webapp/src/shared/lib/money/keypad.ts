import { groupDigits, type Currency } from './formatMoney';

/**
 * State of the «Пастель» keypad (docs/pastel/components/Keypad.md).
 * - сумы: digits only; the «000» key appends three zeros; no leading zeros.
 * - USD: «000» becomes a comma; at most two digits after it.
 * - pristine: the current amount is shown faded and the first press replaces it entirely.
 */
export interface KeypadState {
  text: string;
  pristine: boolean;
}

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '000' | ',' | 'del';

const MAX_WHOLE_DIGITS: Record<Currency, number> = { UZS: 12, USD: 9 };

export function keypadExtraKey(currency: Currency): '000' | ',' {
  return currency === 'UZS' ? '000' : ',';
}

export function emptyKeypad(): KeypadState {
  return { text: '', pristine: false };
}

/** Start from an existing amount (editing): shown faded until the first key replaces it. */
export function keypadFromMinor(minor: number, currency: Currency): KeypadState {
  const abs = Math.abs(Math.round(minor));
  if (abs === 0) return emptyKeypad();
  if (currency === 'UZS') return { text: String(Math.round(abs / 100)), pristine: true };
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  return { text: cents === 0 ? String(whole) : `${whole},${String(cents).padStart(2, '0')}`, pristine: true };
}

/**
 * When the account changes currency the number stays (the design system offers a recalculation
 * separately), but сумы have no fractions: «420,5» becomes «420».
 */
export function keypadForCurrency(state: KeypadState, currency: Currency): KeypadState {
  if (currency === 'USD' || !state.text.includes(',')) return state;
  return { ...state, text: state.text.split(',')[0].replace(/^0+/, '') };
}

export function pressKey(state: KeypadState, key: KeypadKey, currency: Currency): KeypadState {
  const normalized = keypadForCurrency(state, currency);
  const current = normalized.pristine ? '' : normalized.text;

  if (key === 'del') {
    return { text: normalized.pristine ? '' : current.slice(0, -1), pristine: false };
  }

  if (key === ',' || (key === '000' && currency === 'USD')) {
    if (currency !== 'USD' || current.includes(',')) return { text: current, pristine: false };
    return { text: `${current === '' ? '0' : current},`, pristine: false };
  }

  const [whole, fraction] = current.split(',');

  if (fraction !== undefined) {
    if (key === '000') return { text: current, pristine: false };
    if (fraction.length >= 2) return { text: current, pristine: false };
    return { text: current + key, pristine: false };
  }

  const appended = key === '000' ? '000' : key;
  // No leading zeros: «0» then «5» is «5»; zeros on an empty field do nothing.
  let next = whole === '0' ? appended : whole + appended;
  next = next.replace(/^0+/, '');
  if (next.length > MAX_WHOLE_DIGITS[currency]) return { text: current, pristine: false };
  return { text: next, pristine: false };
}

/**
 * A key on a number that is already shown — a hint (the amount at the Central Bank rate, the rate itself) or a value
 * typed before and returned to (TransferForm.md, RateRow.md): `pristine` marks it. The first digit (or a comma)
 * replaces it, «⌫» and «000» edit what is shown. Once typed into, it is the keypad as usual.
 */
export function pressShownKey(state: KeypadState, key: KeypadKey, currency: Currency): KeypadState {
  if (!state.pristine) return pressKey(state, key, currency);
  const edits = key === 'del' || key === '000';
  return pressKey({ text: edits ? state.text : '', pristine: false }, key, currency);
}

/** Integer minor units, or null when nothing is entered (the save button then asks for an amount). */
export function keypadToMinor(state: KeypadState, currency: Currency): number | null {
  const { text } = keypadForCurrency(state, currency);
  if (text === '' || text === '0,') return null;
  const [whole, fraction = ''] = text.split(',');
  const minor = currency === 'UZS'
    ? Number(whole) * 100
    : Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
  return Number.isFinite(minor) && minor > 0 ? minor : null;
}

/** What the amount line shows: «186 400», «420,5». */
export function keypadDisplay(state: KeypadState): string {
  if (state.text === '') return '0';
  const [whole, fraction] = state.text.split(',');
  return fraction === undefined ? groupDigits(whole || '0') : `${groupDigits(whole || '0')},${fraction}`;
}

/** «Серым — только подсказка»: a number not typed yet (0, or the current amount before the first key) is muted. */
export function keypadIsPlaceholder(state: KeypadState): boolean {
  return state.pristine || state.text === '';
}

/** The amount shrinks instead of wrapping: 50px, longer than 10 characters 40px, longer than 13 — 32px. */
export function amountFontSize(display: string): 50 | 40 | 32 {
  const length = display.length;
  if (length > 13) return 32;
  if (length > 10) return 40;
  return 50;
}

/**
 * A key from a computer keyboard (Telegram Desktop) for the app's own keypad: digits, Backspace, and a
 * comma or dot for dollars.
 */
export function keyFromKeyboard(key: string, currency: Currency): KeypadKey | null {
  if (/^[0-9]$/.test(key)) return key as KeypadKey;
  if (key === 'Backspace') return 'del';
  if ((key === ',' || key === '.') && currency === 'USD') return ',';
  return null;
}
