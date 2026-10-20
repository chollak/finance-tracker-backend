import type { UsdRates } from '@/entities/rate';
import { dayMonthShort, type LocalDate } from '@/shared/lib/dates';
import { emptyKeypad, formatMinor, keypadDisplay, keypadToMinor, pressShownKey, type KeypadKey, type KeypadState } from '@/shared/lib/money';

/** «Курс ЦБ / Свой курс» of the sheet. */
export type RateMode = 'cbu' | 'own';

export interface RateSheetState {
  mode: RateMode;
  /** The own rate in whole сум on the keypad; before the first key it is the hint shown (`pristine`). */
  draft: KeypadState;
  /** A key was pressed: the draft is what was typed, not the hint. */
  touched: boolean;
}

/** What «Готово» writes, and what «Отменить» writes back. */
export type RateChange = { kind: 'own'; rateMinor: number; since?: string } | { kind: 'cbu' };

export interface RateSheetView {
  mode: RateMode;
  /** The Central Bank card under «Курс ЦБ»; null under «Свой курс». */
  cbu: { label: string; value: string | null; hint: string } | null;
  /** The field under «Свой курс»; null under «Курс ЦБ». A hint nobody typed is muted (`placeholder`). */
  own: { label: string; amount: { text: string; placeholder: boolean }; hint: string } | null;
  /** «Готово», «Введите свой курс» (off), «Вернуть курс ЦБ». */
  button: { label: string; ready: boolean };
  /** What «Готово» writes; null when the rate in effect stays as it is (the sheet just closes, no toast). */
  change: RateChange | null;
  /** The rate in effect now, written back by «Отменить». */
  undo: RateChange;
  /** The toast after the change. */
  saved: { title: string; detail: string } | null;
}

/** Board «Курс доллара · свой курс»: an own rate from 1 000 to 100 000 сум for $1. */
const MIN_OWN_SUM = 1_000;
const MAX_OWN_SUM = 100_000;

const sum = (rateMinor: number) => formatMinor(rateMinor, 'UZS', { unit: false });
const wholeSum = (rateMinor: number) => Math.round(rateMinor / 100);

function ownInEffect(rates: UsdRates | undefined): { rateMinor: number; since: string } | null {
  return rates?.effective?.source === 'own' && rates.own ? rates.own : null;
}

/** What «Свой курс» shows before a key: the own rate in effect, else the Central Bank's. */
function hintDraft(rates: UsdRates | undefined): KeypadState {
  const shown = ownInEffect(rates)?.rateMinor ?? rates?.cbu?.rateMinor ?? null;
  return shown ? { text: String(wholeSum(shown)), pristine: true } : emptyKeypad();
}

/** The sheet opens on the rate in effect. */
export function openRateSheet(rates: UsdRates | undefined): RateSheetState {
  return { mode: ownInEffect(rates) ? 'own' : 'cbu', draft: hintDraft(rates), touched: false };
}

export function chooseRateMode(state: RateSheetState, mode: RateMode, rates: UsdRates | undefined): RateSheetState {
  if (mode === state.mode) return state;
  return { mode, draft: hintDraft(rates), touched: false };
}

/** The keypad of «Свой курс»: whole сум with «000»; the first digit replaces the hint, «⌫» and «000» edit it. */
export function pressRateKey(state: RateSheetState, key: KeypadKey): RateSheetState {
  return { ...state, draft: pressShownKey(state.draft, key, 'UZS'), touched: true };
}

function cbuCard(rates: UsdRates | undefined, { online, today }: { online: boolean; today: LocalDate }): NonNullable<RateSheetView['cbu']> {
  const cbu = rates?.cbu ?? null;
  const date = cbu ? dayMonthShort(cbu.date, today) : null;
  return {
    label: date ? (online ? `ЦБ Узбекистана · ${date}` : `ЦБ · ${date} · нет связи`) : 'ЦБ Узбекистана',
    value: cbu ? sum(cbu.rateMinor) : null,
    hint: !online
      ? 'Покажу новый курс, как только появится связь.'
      : cbu
        ? 'Обновляется автоматически каждый день.'
        : 'Курса пока нет: загрузится, когда ответит ЦБ.',
  };
}

/** «На 150 сум выше ЦБ (12 650)», «Как у ЦБ» — compared in whole сум, as both are shown. */
function comparedWithCbu(typedSum: number, cbuRateMinor: number | null): string {
  const back = 'Вернуться к ЦБ можно в любой момент.';
  if (cbuRateMinor === null) return back;
  const cbuSum = wholeSum(cbuRateMinor);
  const difference = typedSum - cbuSum;
  if (difference === 0) return `Как у ЦБ. ${back}`;
  const amount = formatMinor(Math.abs(difference) * 100, 'UZS', { unit: false });
  return `На ${amount} сум ${difference > 0 ? 'выше' : 'ниже'} ЦБ (${sum(cbuSum * 100)}). ${back}`;
}

/**
 * The sheet «Курс доллара» (FT-119, board «Курс доллара · свой курс», RateRow.md). «Курс ЦБ» shows the Central Bank
 * rate with its date. «Свой курс» does not set itself: until a key is pressed the field shows the own rate in effect
 * (in ink) or the Central Bank's (a grey hint, and the button asks for a rate); a typed rate is compared with the
 * Central Bank's. «Готово» applies a change with a toast and «Отменить»; with an own rate in effect «Курс ЦБ» turns
 * the button into «Вернуть курс ЦБ». Nothing changed — the sheet just closes.
 */
export function rateSheetView(
  rates: UsdRates | undefined,
  state: RateSheetState,
  context: { online: boolean; today: LocalDate }
): RateSheetView {
  const current = ownInEffect(rates);
  const cbuRateMinor = rates?.cbu?.rateMinor ?? null;
  const undo: RateChange = current ? { kind: 'own', rateMinor: current.rateMinor, since: current.since } : { kind: 'cbu' };
  const recalculated = 'Итог на счетах пересчитан';

  if (state.mode === 'cbu') {
    const change: RateChange | null = current ? { kind: 'cbu' } : null;
    return {
      mode: 'cbu',
      cbu: cbuCard(rates, context),
      own: null,
      button: { label: current ? 'Вернуть курс ЦБ' : 'Готово', ready: true },
      change,
      undo,
      saved: change ? { title: cbuRateMinor ? `Курс ЦБ: ${sum(cbuRateMinor)} сум` : 'Курс ЦБ', detail: recalculated } : null,
    };
  }

  const label = 'Свой курс, сум за $1';
  if (!state.touched) {
    const amount = { text: keypadDisplay(state.draft), placeholder: !current };
    const hint = current
      ? `Ваш курс с ${dayMonthShort(current.since, context.today)}. Наберите новый, чтобы изменить.`
      : 'Сейчас курс ЦБ. Наберите курс, по которому меняете сами.';
    return {
      mode: 'own',
      cbu: null,
      own: { label, amount, hint },
      button: current ? { label: 'Готово', ready: true } : { label: 'Введите свой курс', ready: false },
      change: null,
      undo,
      saved: null,
    };
  }

  const typedMinor = keypadToMinor(state.draft, 'UZS');
  const typedSum = typedMinor === null ? 0 : wholeSum(typedMinor);
  const valid = typedSum >= MIN_OWN_SUM && typedSum <= MAX_OWN_SUM;
  const own = {
    label,
    amount: { text: keypadDisplay(state.draft), placeholder: false },
    hint: valid
      ? comparedWithCbu(typedSum, cbuRateMinor)
      : `Введите курс от ${sum(MIN_OWN_SUM * 100)} до ${sum(MAX_OWN_SUM * 100)} сум.`,
  };
  if (!valid) {
    return { mode: 'own', cbu: null, own, button: { label: 'Введите свой курс', ready: false }, change: null, undo, saved: null };
  }
  const rateMinor = typedSum * 100;
  const change: RateChange | null = current?.rateMinor === rateMinor ? null : { kind: 'own', rateMinor };
  return {
    mode: 'own',
    cbu: null,
    own,
    button: { label: 'Готово', ready: true },
    change,
    undo,
    saved: change ? { title: `Свой курс: ${sum(rateMinor)} сум`, detail: recalculated } : null,
  };
}
