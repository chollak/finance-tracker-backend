import { describe, expect, it } from 'vitest';
import {
  amountFontSize,
  emptyKeypad,
  keypadDisplay,
  keypadForCurrency,
  keypadFromMinor,
  keypadIsPlaceholder,
  keypadToMinor,
  pressKey,
  pressShownKey,
  type KeypadKey,
  type KeypadState,
} from './keypad';
import { NBSP } from './formatMoney';

function type(keys: KeypadKey[], currency: 'UZS' | 'USD', start: KeypadState = emptyKeypad()): KeypadState {
  return keys.reduce((state, key) => pressKey(state, key, currency), start);
}

describe('keypad (сумы)', () => {
  it('types an amount digit by digit', () => {
    const state = type(['1', '8', '6', '4', '0', '0'], 'UZS');
    expect(state.text).toBe('186400');
    expect(keypadDisplay(state)).toBe(`186${NBSP}400`);
    expect(keypadToMinor(state, 'UZS')).toBe(18_640_000);
  });

  it('adds three zeros with the «000» key', () => {
    const state = type(['2', '5', '000'], 'UZS');
    expect(state.text).toBe('25000');
    expect(keypadToMinor(state, 'UZS')).toBe(2_500_000);
  });

  it('ignores leading zeros and a comma', () => {
    expect(type(['0', '000', '5'], 'UZS').text).toBe('5');
    expect(type(['2', ','], 'UZS').text).toBe('2');
  });

  it('erases one digit at a time and returns null when empty', () => {
    const state = type(['2', '5', 'del', 'del'], 'UZS');
    expect(state.text).toBe('');
    expect(keypadToMinor(state, 'UZS')).toBeNull();
    expect(keypadDisplay(state)).toBe('0');
  });

  it('caps the length so the amount still fits', () => {
    const state = type(['9', '000', '000', '000', '1', '2', '3'], 'UZS');
    expect(state.text).toBe('900000000012');
    expect(pressKey(state, '000', 'UZS').text).toBe('900000000012');
  });
});

describe('keypad (USD)', () => {
  it('turns «000» into a comma and allows two decimals', () => {
    const state = type(['4', '2', '0', '000', '5', '0', '7'], 'USD');
    expect(state.text).toBe('420,50');
    expect(keypadToMinor(state, 'USD')).toBe(42_050);
  });

  it('starts a leading comma with zero and ignores a second one', () => {
    expect(type([',', '5', ','], 'USD').text).toBe('0,5');
    expect(keypadToMinor(type([',', '5'], 'USD'), 'USD')).toBe(50);
    expect(keypadToMinor(type([','], 'USD'), 'USD')).toBeNull();
  });
});

describe('switching the account currency', () => {
  it('keeps the number but drops a dollar fraction for сумы', () => {
    const usd = type(['4', '2', '0', ',', '5'], 'USD');
    expect(keypadToMinor(usd, 'UZS')).toBe(42_000);
    expect(keypadForCurrency(usd, 'UZS').text).toBe('420');
    expect(pressKey(usd, '7', 'UZS').text).toBe('4207');
    expect(keypadForCurrency(usd, 'USD')).toBe(usd);
  });
});

describe('editing an existing amount', () => {
  it('shows it faded and replaces it entirely on the first press', () => {
    const start = keypadFromMinor(14_500_000, 'UZS');
    expect(start).toEqual({ text: '145000', pristine: true });
    expect(pressKey(start, '2', 'UZS')).toEqual({ text: '2', pristine: false });
    expect(pressKey(start, 'del', 'UZS')).toEqual({ text: '', pristine: false });
  });

  it('keeps cents of a dollar amount', () => {
    expect(keypadFromMinor(1146, 'USD').text).toBe('11,46');
    expect(keypadFromMinor(42_000, 'USD').text).toBe('420');
  });
});

describe('pressShownKey — a number already shown (a hint or a value typed before)', () => {
  // TransferForm.md, RateRow.md: «первая цифра заменяет её, «⌫» и «000» правят показанное»
  it('the first digit replaces the shown number', () => {
    expect(pressShownKey({ text: '12650', pristine: true }, '1', 'UZS')).toEqual({ text: '1', pristine: false });
    expect(pressShownKey({ text: '101,19', pristine: true }, '9', 'USD')).toEqual({ text: '9', pristine: false });
  });

  it('«⌫» and «000» edit the shown number instead of clearing it', () => {
    expect(pressShownKey({ text: '101,19', pristine: true }, 'del', 'USD')).toEqual({ text: '101,1', pristine: false });
    expect(pressShownKey({ text: '12', pristine: true }, '000', 'UZS')).toEqual({ text: '12000', pristine: false });
  });

  it('a comma on a shown dollar amount starts a new one', () => {
    expect(pressShownKey({ text: '101,19', pristine: true }, ',', 'USD')).toEqual({ text: '0,', pristine: false });
  });

  it('once typed into, it is the keypad as usual', () => {
    expect(pressShownKey({ text: '12', pristine: false }, '8', 'UZS')).toEqual(pressKey({ text: '12', pristine: false }, '8', 'UZS'));
  });
});

describe('keypadIsPlaceholder', () => {
  it('mutes a number nobody typed yet', () => {
    expect(keypadIsPlaceholder(emptyKeypad())).toBe(true);
    expect(keypadIsPlaceholder(keypadFromMinor(2_500_000, 'UZS'))).toBe(true);
    expect(keypadIsPlaceholder({ text: '25', pristine: false })).toBe(false);
  });
});

describe('amountFontSize', () => {
  it('shrinks long amounts instead of wrapping', () => {
    expect(amountFontSize(`186${NBSP}400`)).toBe(50);
    expect(amountFontSize(`12${NBSP}500${NBSP}000`)).toBe(50);
    expect(amountFontSize(`125${NBSP}500${NBSP}000`)).toBe(40);
    expect(amountFontSize(`999${NBSP}999${NBSP}999${NBSP}999`)).toBe(32);
  });
});
