import { describe, expect, it } from 'vitest';
import { displayCurrencyState, usdUnavailableNotice } from './displayCurrency';

/**
 * FT-137, boards «Главная», «Главная · тёмная»: «Сум / USD» in the header of Home. The choice is the user's
 * setting; dollars are shown only at the rate in effect (own or the Central Bank's), and without one Home
 * stays in сум and says why.
 */

const RATE = 1_265_000; // 12 650,00 сум per 1 USD

describe('the display currency', () => {
  it('is сум for a user who never chose', () => {
    expect(displayCurrencyState({ chosen: undefined, rateMinor: RATE, rateFailed: false })).toEqual({
      chosen: 'UZS',
      shown: 'UZS',
      rateMinor: RATE,
      usdUnavailable: null,
    });
  });

  it('is dollars at the rate in effect once the user chose USD', () => {
    expect(displayCurrencyState({ chosen: 'USD', rateMinor: RATE, rateFailed: false })).toMatchObject({
      chosen: 'USD',
      shown: 'USD',
      rateMinor: RATE,
      usdUnavailable: null,
    });
  });

  it('stays in сум without a rate, whatever was chosen, and keeps the choice for when a rate comes', () => {
    expect(displayCurrencyState({ chosen: 'USD', rateMinor: null, rateFailed: false })).toEqual({
      chosen: 'USD',
      shown: 'UZS',
      rateMinor: null,
      usdUnavailable: 'missing',
    });
    expect(displayCurrencyState({ chosen: 'UZS', rateMinor: null, rateFailed: false }).usdUnavailable).toBe('missing');
  });

  it('tells a rate that could not be read from a rate that does not exist yet', () => {
    expect(displayCurrencyState({ chosen: 'USD', rateMinor: null, rateFailed: true })).toMatchObject({
      shown: 'UZS',
      usdUnavailable: 'failed',
    });
  });
});

describe('why USD is unavailable', () => {
  it('says there is no rate yet and that dollars come with it', () => {
    expect(usdUnavailableNotice('missing')).toEqual({
      title: 'Курса доллара пока нет',
      detail: 'Покажем в долларах, когда появится курс',
    });
  });

  it('says the rate did not load and what to do', () => {
    expect(usdUnavailableNotice('failed')).toEqual({
      title: 'Не удалось загрузить курс доллара',
      detail: 'Проверьте связь и нажмите ещё раз',
    });
  });
});
