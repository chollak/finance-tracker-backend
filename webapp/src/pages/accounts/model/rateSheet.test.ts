import { describe, expect, it } from 'vitest';
import type { UsdRates } from '@/entities/rate';
import { NBSP, type KeypadKey } from '@/shared/lib/money';
import { chooseRateMode, openRateSheet, pressRateKey, rateSheetView, type RateSheetState } from './rateSheet';

/**
 * FT-119, board «Курс доллара · свой курс» (RateRow.md, design-system «Курс — ЦБ или свой»): «Курс ЦБ / Свой курс»;
 * the own rate is typed on the keypad and applied by «Готово» with a toast and «Отменить»; until something is
 * typed the Central Bank rate is a grey hint and the button asks for a rate; «Вернуть курс ЦБ» goes back.
 */

const TODAY = '2026-10-14';
const CONTEXT = { online: true, today: TODAY };
const CBU: UsdRates = {
  effective: { rateMinor: 1_265_000, source: 'cbu', date: '2026-10-14' },
  cbu: { rateMinor: 1_265_000, date: '2026-10-14', fetchedAt: '2026-10-14T04:00:00.000Z' },
  own: null,
};
const OWN: UsdRates = {
  ...CBU,
  effective: { rateMinor: 1_280_000, source: 'own', date: '2026-10-10' },
  own: { rateMinor: 1_280_000, since: '2026-10-10' },
};

/** Digit groups split by a non-breaking space; a rate is followed by « сум» as on the rate row (FT-118). */
const sum = (text: string) => text.replace(/(\d) (?=\d)/g, `$1${NBSP}`);
const typeRate = (state: RateSheetState, value: string) =>
  (value.split('') as KeypadKey[]).reduce((current, key) => pressRateKey(current, key), state);
const own = (rates: UsdRates) => chooseRateMode(openRateSheet(rates), 'own', rates);

describe('the rate sheet', () => {
  it('opens on the Central Bank rate with its date; «Готово» changes nothing', () => {
    const view = rateSheetView(CBU, openRateSheet(CBU), CONTEXT);

    expect(view.mode).toBe('cbu');
    expect(view.cbu).toEqual({ label: 'ЦБ Узбекистана · 14 окт', value: sum('12 650'), hint: 'Обновляется автоматически каждый день.' });
    expect(view.own).toBeNull();
    expect(view.button).toEqual({ label: 'Готово', ready: true });
    expect(view.change).toBeNull();
    expect(view.saved).toBeNull();
  });

  it('without a connection names the date of the last known rate', () => {
    expect(rateSheetView(CBU, openRateSheet(CBU), { online: false, today: TODAY }).cbu).toEqual({
      label: 'ЦБ · 14 окт · нет связи',
      value: sum('12 650'),
      hint: 'Покажу новый курс, как только появится связь.',
    });
  });

  it('«Свой курс» does not set itself: the Central Bank rate is a grey hint and the button asks for a rate', () => {
    const view = rateSheetView(CBU, own(CBU), CONTEXT);

    expect(view.mode).toBe('own');
    expect(view.cbu).toBeNull();
    expect(view.own).toEqual({
      label: 'Свой курс, сум за $1',
      amount: { text: sum('12 650'), placeholder: true },
      hint: 'Сейчас курс ЦБ. Наберите курс, по которому меняете сами.',
    });
    expect(view.button).toEqual({ label: 'Введите свой курс', ready: false });
    expect(view.change).toBeNull();
  });

  it('a typed rate is compared with the Central Bank and applied by «Готово» with a toast and its undo', () => {
    const view = rateSheetView(CBU, typeRate(own(CBU), '12800'), CONTEXT);

    expect(view.own).toEqual({
      label: 'Свой курс, сум за $1',
      amount: { text: sum('12 800'), placeholder: false },
      hint: sum('На 150 сум выше ЦБ (12 650). Вернуться к ЦБ можно в любой момент.'),
    });
    expect(view.button).toEqual({ label: 'Готово', ready: true });
    expect(view.change).toEqual({ kind: 'own', rateMinor: 1_280_000 });
    expect(view.saved).toEqual({ title: sum('Свой курс: 12 800 сум'), detail: 'Итог на счетах пересчитан' });
    expect(view.undo).toEqual({ kind: 'cbu' });
  });

  it('below the Central Bank, the same as it, and outside 1 000…100 000', () => {
    expect(rateSheetView(CBU, typeRate(own(CBU), '12500'), CONTEXT).own?.hint).toBe(
      sum('На 150 сум ниже ЦБ (12 650). Вернуться к ЦБ можно в любой момент.')
    );
    expect(rateSheetView(CBU, typeRate(own(CBU), '12650'), CONTEXT).own?.hint).toBe('Как у ЦБ. Вернуться к ЦБ можно в любой момент.');
    for (const value of ['999', '100001']) {
      const view = rateSheetView(CBU, typeRate(own(CBU), value), CONTEXT);
      expect(view.own?.hint).toBe(sum('Введите курс от 1 000 до 100 000 сум.'));
      expect(view.button).toEqual({ label: 'Введите свой курс', ready: false });
      expect(view.change).toBeNull();
    }
  });

  it('«⌫» edits the grey hint, the first digit replaces it', () => {
    expect(rateSheetView(CBU, pressRateKey(own(CBU), 'del'), CONTEXT).own?.amount).toEqual({ text: sum('1 265'), placeholder: false });
    expect(rateSheetView(CBU, pressRateKey(own(CBU), '1'), CONTEXT).own?.amount).toEqual({ text: '1', placeholder: false });
  });

  it('an own rate in effect opens in ink with its date; a new one replaces it, «Отменить» brings the old one back', () => {
    const opened = rateSheetView(OWN, openRateSheet(OWN), CONTEXT);
    expect(opened.mode).toBe('own');
    expect(opened.own).toEqual({
      label: 'Свой курс, сум за $1',
      amount: { text: sum('12 800'), placeholder: false },
      hint: 'Ваш курс с 10 окт. Наберите новый, чтобы изменить.',
    });
    expect(opened.button).toEqual({ label: 'Готово', ready: true });
    expect(opened.change).toBeNull();

    const changed = rateSheetView(OWN, typeRate(openRateSheet(OWN), '12900'), CONTEXT);
    expect(changed.change).toEqual({ kind: 'own', rateMinor: 1_290_000 });
    expect(changed.undo).toEqual({ kind: 'own', rateMinor: 1_280_000, since: '2026-10-10' });

    // The same rate typed again is not a change: no toast
    expect(rateSheetView(OWN, typeRate(openRateSheet(OWN), '12800'), CONTEXT).change).toBeNull();
  });

  it('«Вернуть курс ЦБ» from an own rate, with «Отменить» back to it', () => {
    const view = rateSheetView(OWN, chooseRateMode(openRateSheet(OWN), 'cbu', OWN), CONTEXT);

    expect(view.cbu?.value).toBe(sum('12 650'));
    expect(view.button).toEqual({ label: 'Вернуть курс ЦБ', ready: true });
    expect(view.change).toEqual({ kind: 'cbu' });
    expect(view.saved).toEqual({ title: sum('Курс ЦБ: 12 650 сум'), detail: 'Итог на счетах пересчитан' });
    expect(view.undo).toEqual({ kind: 'own', rateMinor: 1_280_000, since: '2026-10-10' });
  });

  it('before the Central Bank has answered once: no number to show or compare with', () => {
    const none: UsdRates = { effective: null, cbu: null, own: null };
    expect(rateSheetView(none, openRateSheet(none), CONTEXT).cbu).toEqual({
      label: 'ЦБ Узбекистана',
      value: null,
      hint: 'Курса пока нет: загрузится, когда ответит ЦБ.',
    });
    expect(rateSheetView(none, own(none), CONTEXT).own?.amount).toEqual({ text: '0', placeholder: true });
    expect(rateSheetView(none, typeRate(own(none), '12800'), CONTEXT).own?.hint).toBe('Вернуться к ЦБ можно в любой момент.');
    expect(rateSheetView(none, typeRate(own(none), '12800'), CONTEXT).saved?.title).toBe(sum('Свой курс: 12 800 сум'));
  });
});
