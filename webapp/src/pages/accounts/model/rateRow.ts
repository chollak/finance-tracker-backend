import type { UsdRates } from '@/entities/rate';
import { dayMonthShort, type LocalDate } from '@/shared/lib/dates';
import { formatMinor } from '@/shared/lib/money';

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

export interface RateSheetModel {
  /** «ЦБ Узбекистана · 14 окт». */
  label: string;
  /** «12 650» (сум за $1); null before the Central Bank has answered once. */
  value: string | null;
  hint: string;
  /** An own rate in effect, said in one line; null with the Central Bank's. */
  own: string | null;
}

/**
 * The sheet «Курс доллара» (RateRow.md) as far as FT-118 goes: the Central Bank rate with its date and how it is
 * updated. Choosing an own rate on the keypad comes with FT-119.
 */
export function rateSheetModel(rates: UsdRates | undefined, { online, today }: RateContext): RateSheetModel {
  const cbu = rates?.cbu ?? null;
  const date = cbu ? dayMonthShort(cbu.date, today) : null;
  const own = rates?.effective?.source === 'own' && rates.own ? rates.own : null;
  return {
    label: date ? (online ? `ЦБ Узбекистана · ${date}` : `ЦБ · ${date} · нет связи`) : 'ЦБ Узбекистана',
    value: cbu ? sum(cbu.rateMinor) : null,
    hint: !online
      ? 'Покажу новый курс, как только появится связь.'
      : cbu
        ? 'Обновляется автоматически каждый день.'
        : 'Курса пока нет: загрузится, когда ответит ЦБ.',
    own: own ? `Сейчас действует свой курс: ${sum(own.rateMinor)} сум с ${dayMonthShort(own.since, today)}` : null,
  };
}
