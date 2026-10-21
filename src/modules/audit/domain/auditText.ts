/**
 * The words of the spending audit (FT-130): sums, counts, months and days as the boards «Ревизия трат» write them.
 * Numbers are grouped by a non-breaking space and «сум» stays on their line, as `formatMinor` does in the webapp.
 */
export const NBSP = ' ';

const MONTHS_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];

const monthIndex = (date: string) => Number(date.slice(5, 7)) - 1;

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «732 000 сум» from minor units, rounded to whole сум; never a sign. */
export function sumText(minor: number): string {
  const whole = String(Math.round(Math.abs(minor) / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${whole}${NBSP}сум`;
}

/** «1 раз», «4 раза», «16 раз». */
export function timesText(n: number): string {
  return `${n}${NBSP}${plural(n, 'раз', 'раза', 'раз')}`;
}

/** «сентября» for 2026-09 or 2026-09-06. */
export function monthOf(date: string): string {
  return MONTHS_OF[monthIndex(date)];
}

/** «в сентябре» for 2026-09. */
export function inMonth(date: string): string {
  return `в ${MONTHS_IN[monthIndex(date)]}`;
}

/** «6 сентября» for 2026-09-06. */
export function dayText(date: string): string {
  return `${Number(date.slice(8, 10))}${NBSP}${monthOf(date)}`;
}

/** How many times more often: «вдвое», «втрое», «вчетверо», then «в 5 раз». */
export function ratioText(ratio: number): string {
  if (ratio < 2.5) return 'вдвое';
  if (ratio < 3.5) return 'втрое';
  if (ratio < 4.5) return 'вчетверо';
  const n = Math.round(ratio);
  return `в ${n}${NBSP}${plural(n, 'раз', 'раза', 'раз')}`;
}

/** The first letter as a capital: notes written «такси» show as «Такси». */
export function capitalized(text: string): string {
  return text.charAt(0).toLocaleUpperCase('ru-RU') + text.slice(1);
}
