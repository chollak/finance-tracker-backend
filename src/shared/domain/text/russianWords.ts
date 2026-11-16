/**
 * The Russian words written next to numbers and dates (#281): the bot's messages, the audit, the export caption and the
 * log of notices not sent read them here instead of keeping copies. Months are indexed from 0, January first.
 */

/** «14 октября», «с начала октября»: the month in the genitive. */
export const MONTHS_OF = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
] as const;

/** «в октябре»: the month in the prepositional. */
export const MONTHS_IN = [
  'январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре',
] as const;

/** «Октябрь · 1–14»: the month's own name. */
export const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
] as const;

/** The form for a count, by its last digits: «1 запись», «2 записи», «5 записей», «11 записей», «21 запись». */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
