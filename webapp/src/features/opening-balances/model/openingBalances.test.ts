import { describe, expect, it } from 'vitest';
import { NBSP, type KeypadKey } from '@/shared/lib/money';
import {
  initialOpeningBalances,
  keyFromKeyboard,
  openingBalancesPayload,
  openingBalancesRows,
  openingBalancesNote,
  pressOpeningKey,
  selectOpeningRow,
  startButtonLabel,
  activeCurrency,
  type OpeningBalancesState,
} from './openingBalances';

/** Amounts use non-breaking spaces between digit groups and before the unit, words keep plain ones. */
const n = (text: string) => text.replace(/(\d) (?=\d|сум|USD)/g, `$1${NBSP}`);

function type(keys: KeypadKey[], start: OpeningBalancesState = initialOpeningBalances()): OpeningBalancesState {
  return keys.reduce(pressOpeningKey, start);
}

/** The «суммы введены» board: 1 250 000 cash, 3 180 000 card, 420 dollars, dollars row active. */
function filled(): OpeningBalancesState {
  let state = type(['1', '2', '5', '0', '000']);
  state = type(['3', '1', '8', '0', '000'], selectOpeningRow(state, 'card'));
  return type(['4', '2', '0'], selectOpeningRow(state, 'usd'));
}

describe('first launch: opening balances form (FT-109)', () => {
  it('starts with cash, card and dollars at 0 and cash being entered', () => {
    const rows = openingBalancesRows(initialOpeningBalances());

    expect(rows.map(({ name, caption, value, unit }) => ({ name, caption, value, unit }))).toEqual([
      { name: 'Наличные', caption: 'сумы · наличные', value: '0', unit: 'сум' },
      { name: 'Карта', caption: 'сумы · карта', value: '0', unit: 'сум' },
      { name: 'Доллары', caption: 'доллары · наличные', value: '0', unit: 'USD' },
    ]);
    expect(rows.map(row => row.active)).toEqual([true, false, false]);
    expect(rows.every(row => row.isPlaceholder)).toBe(true);
    expect(rows[0].ariaLabel).toBe('Наличные: 0 сум, вводится сейчас');
    expect(rows[1].ariaLabel).toBe('Карта: 0 сум. Ввести');
  });

  it('types into the active row with the keypad, «000» included', () => {
    const rows = openingBalancesRows(type(['1', '2', '5', '0', '000']));

    expect(rows[0]).toMatchObject({ value: n('1 250 000'), isPlaceholder: false });
    expect(rows[1].value).toBe('0');
  });

  it('gives the dollar row a comma instead of «000» and two digits after it', () => {
    let state = selectOpeningRow(initialOpeningBalances(), 'usd');
    expect(activeCurrency(state)).toBe('USD');

    state = type(['4', '2', '0', ',', '5', '0', '7'], state);

    expect(openingBalancesRows(state)[2].value).toBe('420,50');
    expect(openingBalancesPayload(state).usdMinor).toBe(42_050);
  });

  it('replaces a row’s number with the first digit after choosing it again; erase and «000» edit it', () => {
    let state = type(['5', '0', '000']); // 50 000
    state = selectOpeningRow(selectOpeningRow(state, 'card'), 'cash');
    expect(openingBalancesRows(state)[0].value).toBe(n('50 000'));

    expect(openingBalancesRows(type(['7'], state))[0].value).toBe('7');
    expect(openingBalancesRows(type(['del'], state))[0].value).toBe(n('5 000'));
    expect(openingBalancesRows(type(['000'], state))[0].value).toBe(n('50 000 000'));
  });

  it('sends what is entered in minor units, nothing entered as 0', () => {
    expect(openingBalancesPayload(filled())).toEqual({ cashMinor: 125_000_000, cardMinor: 318_000_000, usdMinor: 42_000 });
    expect(openingBalancesPayload(initialOpeningBalances())).toEqual({ cashMinor: 0, cardMinor: 0, usdMinor: 0 });
  });

  it('labels the button «Начать с нуля» until something is entered', () => {
    expect(startButtonLabel(initialOpeningBalances())).toBe('Начать с нуля');
    expect(startButtonLabel(type(['5']))).toBe('Начать');
    expect(startButtonLabel(type(['5', 'del']))).toBe('Начать с нуля');
  });

  describe('the line under the accounts', () => {
    const cbu = { rateMinor: 1_265_000, source: 'cbu' as const };

    it('says the amounts can be fixed later while nothing is entered', () => {
      expect(openingBalancesNote(initialOpeningBalances(), cbu)).toBe(
        'Не знаете точно — оставьте 0 и поправьте потом: «Ещё» → «Счета и курс доллара». Там же — другие счета.'
      );
    });

    it('gives the total with dollars at the Central Bank rate', () => {
      expect(openingBalancesNote(filled(), cbu)).toBe(
        n('Всего ≈ 9 743 000 сум, доллары — по курсу ЦБ 12 650. Другие счета добавите потом: «Ещё» → «Счета и курс доллара».')
      );
    });

    it('names the own rate when the user has one', () => {
      expect(openingBalancesNote(filled(), { rateMinor: 1_300_000, source: 'own' })).toContain(
        n('доллары — по своему курсу 13 000')
      );
    });

    it('is exact, without «≈» and a rate, when there are no dollars', () => {
      expect(openingBalancesNote(type(['1', '2', '5', '0', '000']), cbu)).toBe(
        n('Всего 1 250 000 сум. Другие счета добавите потом: «Ещё» → «Счета и курс доллара».')
      );
    });

    it('does not add dollars to сум when no rate is known', () => {
      expect(openingBalancesNote(filled(), null)).toBe(
        n('Всего 4 430 000 сум и 420,00 USD — курса доллара пока нет. Другие счета добавите потом: «Ещё» → «Счета и курс доллара».')
      );
      expect(openingBalancesNote(type(['4', '2', '0'], selectOpeningRow(initialOpeningBalances(), 'usd')), null)).toBe(
        n('Всего 420,00 USD — курса доллара пока нет. Другие счета добавите потом: «Ещё» → «Счета и курс доллара».')
      );
    });
  });

  it('takes digits, erase and a comma from a computer keyboard (Telegram Desktop)', () => {
    expect(keyFromKeyboard('7', 'UZS')).toBe('7');
    expect(keyFromKeyboard('Backspace', 'UZS')).toBe('del');
    expect(keyFromKeyboard(',', 'USD')).toBe(',');
    expect(keyFromKeyboard('.', 'USD')).toBe(',');
    expect(keyFromKeyboard(',', 'UZS')).toBeNull();
    expect(keyFromKeyboard('a', 'UZS')).toBeNull();
    expect(keyFromKeyboard('Enter', 'UZS')).toBeNull();
  });
});
