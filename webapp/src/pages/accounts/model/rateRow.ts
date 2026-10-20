import type { AccountsOverview } from '@/entities/account';
import type { UsdRates } from '@/entities/rate';
import { dayMonthShort, type LocalDate } from '@/shared/lib/dates';
import { formatMinor } from '@/shared/lib/money';

/**
 * The rates as far as they are known. Until `GET /api/rates/usd` answers — or when it fails — the rate the total was
 * counted at (`GET /api/accounts` `rate`) is the one in effect, so the row and the total never contradict each other.
 */
export function knownRates(rates: UsdRates | undefined, counted: AccountsOverview['rate'] | undefined): UsdRates | undefined {
  if (rates || !counted) return rates;
  return {
    effective: counted,
    cbu: counted.source === 'cbu' ? { rateMinor: counted.rateMinor, date: counted.date, fetchedAt: '' } : null,
    own: counted.source === 'own' ? { rateMinor: counted.rateMinor, since: counted.date } : null,
  };
}

interface RateContext {
  /** The device has a connection; without one the last known rate is in effect and the row says so. */
  online: boolean;
  today: LocalDate;
}

export interface RateRowModel {
  /** «Курс доллара · 12 650 сум». */
  title: string;
  /** Which rate is in effect: «ЦБ на 14 окт», «Свой с 14 окт · ЦБ 12 650», «Нет связи · курс ЦБ на 13 окт». */
  caption: string;
  /** The «нет сети» icon instead of the chart. */
  offline: boolean;
}

const sum = (rateMinor: number) => formatMinor(rateMinor, 'UZS', { unit: false });

/**
 * The rate row of the accounts screen (RateRow.md): always says which rate is in effect and from when. Without a
 * connection the total stands on the last known rate, and the row names its date.
 */
export function rateRowModel(rates: UsdRates | undefined, { online, today }: RateContext): RateRowModel {
  const effective = rates?.effective ?? null;
  if (!effective) {
    return { title: 'Курс доллара', caption: 'Курса пока нет: загрузится, когда ответит ЦБ', offline: !online };
  }
  const title = `Курс доллара · ${sum(effective.rateMinor)} сум`;
  if (effective.source === 'own') {
    const since = dayMonthShort(rates?.own?.since ?? effective.date, today);
    const cbu = rates?.cbu ? ` · ЦБ ${sum(rates.cbu.rateMinor)}` : '';
    return { title, caption: `Свой с ${since}${cbu}`, offline: !online };
  }
  const date = dayMonthShort(effective.date, today);
  return { title, caption: online ? `ЦБ на ${date}` : `Нет связи · курс ЦБ на ${date}`, offline: !online };
}
