import type { Currency } from '@/shared/lib/money';

/**
 * «Сум / USD» in the header of Home (FT-137, boards «Главная», «Главная · тёмная»; Segmented.md,
 * BalanceCard.md): the currency the balance card and the month tiles are shown in. The choice is the
 * user's setting (FT-098); dollars are shown only at the rate in effect — the own rate or the Central
 * Bank's (FT-102). Without one Home stays in сум, as GET /api/accounts gives the total, and the choice waits
 * for a rate.
 */

/** The currency money is shown in and the rate dollars are counted at — what the balance card and the tiles take. */
export interface DisplayMoney {
  currency: Currency;
  /** сум×100 per 1 USD; null without a rate — then everything stays in сум. */
  rateMinor: number | null;
}

/** Money as Home showed it before FT-137, and as it is for a user who never chose. */
export const IN_UZS: DisplayMoney = { currency: 'UZS', rateMinor: null };

/** The currency money is really shown in: dollars only with a rate. */
export function shownCurrency(display: DisplayMoney): Currency {
  return display.currency === 'USD' && display.rateMinor ? 'USD' : 'UZS';
}

/** Why «USD» cannot be chosen now: there is no rate yet, or the rate could not be read. */
export type UsdUnavailable = 'missing' | 'failed';

export interface DisplayCurrencyState {
  /** What the user chose; сум until they choose. */
  chosen: Currency;
  /** What Home shows: dollars only with a rate. */
  shown: Currency;
  /** The rate in effect, сум×100 per 1 USD; null without one. */
  rateMinor: number | null;
  usdUnavailable: UsdUnavailable | null;
}

export function displayCurrencyState({
  chosen,
  rateMinor,
  rateFailed,
}: {
  chosen: Currency | undefined;
  rateMinor: number | null;
  /** The rate could not be read (rather than: there is none yet). */
  rateFailed: boolean;
}): DisplayCurrencyState {
  const choice = chosen ?? 'UZS';
  const usdUnavailable = rateMinor ? null : rateFailed ? 'failed' : 'missing';
  return { chosen: choice, shown: usdUnavailable ? 'UZS' : choice, rateMinor: rateMinor || null, usdUnavailable };
}

export interface DisplayCurrencyNotice {
  title: string;
  detail: string;
}

/** What pressing an unavailable «USD» says (an info toast, as the composer's microphone does). */
export function usdUnavailableNotice(reason: UsdUnavailable): DisplayCurrencyNotice {
  return reason === 'missing'
    ? { title: 'Курса доллара пока нет', detail: 'Покажем в долларах, когда появится курс' }
    : { title: 'Не удалось загрузить курс доллара', detail: 'Проверьте связь и нажмите ещё раз' };
}

/** The accessible name of an unavailable «USD»: the reason is heard where the segment is. */
export function usdUnavailableLabel(reason: UsdUnavailable): string {
  return reason === 'missing' ? 'USD — курса доллара пока нет' : 'USD — курс доллара не загрузился';
}

export const SAVE_FAILED_NOTICE: DisplayCurrencyNotice = {
  title: 'Не получилось переключить валюту',
  detail: 'Проверьте связь и попробуйте ещё раз',
};
