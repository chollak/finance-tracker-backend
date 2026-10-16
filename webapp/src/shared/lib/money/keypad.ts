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

export function pressKey(state: KeypadState, key: KeypadKey, currency: Currency): KeypadState {
  const current = state.pristine ? '' : state.text;

  if (key === 'del') {
    return { text: state.pristine ? '' : current.slice(0, -1), pristine: false };
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

/** Integer minor units, or null when nothing is entered (the save button then asks for an amount). */
export function keypadToMinor(state: KeypadState, currency: Currency): number | null {
  if (state.text === '' || state.text === '0,' ) return null;
  if (currency === 'UZS') return Number(state.text) * 100;
  const [whole, fraction = ''] = state.text.split(',');
  const minor = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
  return minor === 0 ? null : minor;
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
