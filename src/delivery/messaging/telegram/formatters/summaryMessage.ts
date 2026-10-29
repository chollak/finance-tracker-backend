import { Markup } from 'telegraf';
import { InlineKeyboardButton } from 'telegraf/types';
import { ComparedPeriod, DaySummary, MonthSummary } from '../../../../modules/notification/domain/dailySummary';
import { absoluteDate, amountDigits, amountWithUnit, escapeHtml, NBSP, recordsWord } from './recordMessage';

/**
 * Итоги дня и месяца in the chat (FT-124, docs/pastel/components/BotNotice.md, boards «Бот · итоги дня» and
 * «Бот · меню команд»). Bold title, the total with how many records, after an empty line up to 3 categories,
 * after another one line about the month. No emoji; the link to the app in a row of its own.
 *
 *   Итоги дня · 14 октября                       ← bold
 *   Потрачено 210 400 сум · 2 записи
 *
 *   Продукты · 186 400
 *   Транспорт · 24 000
 *
 *   С начала октября — 7 684 400 сум, на 714 400 сум больше, чем за 1–14 сентября.
 *
 * The numbers are Home's: dollars at the user's rate, and an amount with converted dollars inside gets «≈», as on
 * the analytics screen («Покупки · ≈ 704 000»). The count is of every expense record, dollars left out for want
 * of a rate included («Доллары не вошли: курса пока нет.»). Records awaiting review are in no total: «Нужно
 * проверить в Kapelka: 1 запись — пока не в итогах.»
 */

export interface BotNotice {
  text: string;
  keyboard: InlineKeyboardButton[][];
}

const MONTHS_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

/** «Да, не было» under the empty-day question; the argument is the day it is about. */
export const NO_SPENDING_CALLBACK_PATTERN = /^n:none:(\d{4}-\d{2}-\d{2})$/;

export function noSpendingCallback(day: string): string {
  return `n:none:${day}`;
}

const USD_LEFT_OUT = 'Доллары не вошли: курса пока нет.';

const monthIndex = (yearMonth: string) => Number(yearMonth.slice(5, 7)) - 1;
const dayOf = (date: string) => Number(date.slice(8, 10));
/** «1–14», on the 1st just «1». */
const daysUpTo = (day: number) => (day === 1 ? '1' : `1–${day}`);

/** «7 684 400 сум». */
const som = (minor: number) => amountWithUnit(Math.abs(minor), 'UZS');

/** «≈ 728 000 сум»: dollars converted at the rate are inside. */
const approx = (hasUsd: boolean, text: string) => (hasUsd ? `≈${NBSP}${text}` : text);

/** «Продукты · 186 400», «Покупки · ≈ 704 000». */
const categoryLine = (category: { name: string; amountMinor: number; hasUsd: boolean }) =>
  `${escapeHtml(category.name)} · ${approx(category.hasUsd, amountDigits(category.amountMinor, 'UZS'))}`;

/** «Нужно проверить в Kapelka: 1 запись — пока не в итогах.» */
const needsReviewLine = (count: number) => `Нужно проверить в Kapelka: ${recordsWord(count)} — пока не в итогах.`;

/** What the month is compared with, as the analytics screen says it: «чем за 1–14 сентября», «чем в сентябре». */
function previousWords(previous: ComparedPeriod): { than: string; like: string } {
  const index = monthIndex(previous.month);
  if (previous.wholeMonth) return { than: `чем в ${MONTHS_IN[index]}`, like: `как в ${MONTHS_IN[index]}` };
  // A plain space, as on the board: a long line breaks before the month, not inside «1–14»
  const days = `${daysUpTo(dayOf(previous.to))} ${MONTHS_OF[index]}`;
  return { than: `чем за ${days}`, like: `как за ${days}` };
}

/** «на 714 400 сум больше, чем за 1–14 сентября», «столько же, как за 1–14 сентября». */
function comparisonWords(comparison: NonNullable<MonthSummary['comparison']>): string {
  const words = previousWords(comparison.previous);
  if (comparison.diffMinor === 0) return `столько же, ${words.like}`;
  return `на ${som(comparison.diffMinor)} ${comparison.diffMinor > 0 ? 'больше' : 'меньше'}, ${words.than}`;
}

/** The one line about the month under the day; none while nothing was spent this month. */
function monthLine(month: MonthSummary): string | null {
  if (month.totalMinor <= 0) return null;
  const head = `С начала ${MONTHS_OF[monthIndex(month.month)]} — ${approx(month.hasUsd, som(month.totalMinor))}`;
  return month.comparison ? `${head}, ${comparisonWords(month.comparison)}.` : `${head}.`;
}

/** A link to the Mini App in a row of its own: «Открыть Kapelka ↗»; nothing when the Mini App is not configured. */
export function appLinkRows(label: string, url: string | undefined): InlineKeyboardButton[][] {
  return url ? [[Markup.button.webApp(`${label} ↗`, url)]] : [];
}

/** «Итоги дня · 14 октября»; caught up the next morning — «Итоги за вчера · 14 октября» (FT-164). */
function dayTitle(day: string, today: string, late = false): string {
  return `<b>${late ? 'Итоги за вчера' : 'Итоги дня'} · ${absoluteDate(day, today)}</b>`;
}

/** Blocks of lines with an empty line between them. */
function blocks(...parts: Array<string[] | null>): string {
  return parts.filter((part): part is string[] => Boolean(part && part.length)).map(part => part.join('\n')).join('\n\n');
}

/**
 * The summary of a day — the evening notice (`scheduled`), the same the next morning when it did not go out by
 * midnight (`late`, FT-164), and /today. A day without records: the evening asks «Трат правда не было?» with «Да, не
 * было»; /today says «Записей пока нет.»
 */
export function formatDaySummary(
  summary: DaySummary,
  options: { today: string; appUrl?: string; scheduled?: boolean; late?: boolean }
): BotNotice {
  const title = dayTitle(summary.day, options.today, options.late);
  if (summary.recordCount === 0) {
    if (!options.scheduled) return { text: `${title}\nЗаписей пока нет.`, keyboard: [] };
    // The morning after, plain «обед 45к» would be written for today
    const example = options.late ? 'вчера обед 45к' : 'обед 45к';
    return {
      text: blocks([title, 'Записей нет. Трат правда не было?'], [`<i>Если что-то было — просто напишите, например «${example}».</i>`]),
      keyboard: [[Markup.button.callback('Да, не было', noSpendingCallback(summary.day))]],
    };
  }

  const head = [title];
  // Expenses in the total; a day of dollars only, all without a rate, has none to show
  const counted = summary.expenseCount - summary.usdLeftOutCount;
  if (counted > 0) head.push(`Потрачено ${approx(summary.expenseHasUsd, som(summary.expenseMinor))} · ${recordsWord(summary.expenseCount)}`);
  if (summary.usdLeftOutCount > 0) head.push(USD_LEFT_OUT);
  if (summary.needsReviewCount > 0) head.push(needsReviewLine(summary.needsReviewCount));
  // Only income or a transfer: no spending to tell
  if (head.length === 1) head.push('Трат не было.');
  const month = monthLine(summary.month);
  return {
    text: blocks(head, counted > 0 ? summary.categories.map(categoryLine) : null, month ? [month] : null),
    keyboard: appLinkRows('Открыть Kapelka', options.appUrl),
  };
}

/** «Да, не было» pressed: the question becomes the answer, without buttons; under «Итоги за вчера» it keeps that title. */
export function formatNoSpending(day: string, today: string, late = false): BotNotice {
  return { text: `${dayTitle(day, today, late)}\nОтметил: ${absoluteDate(day, today)} трат не было.`, keyboard: [] };
}

/** /month: «Октябрь · 1–14», what was spent against the same days before, the 3 largest categories. */
export function formatMonthSummary(summary: MonthSummary, options: { analyticsUrl?: string }): BotNotice {
  const index = monthIndex(summary.month);
  const head = [`<b>${MONTH_NAMES[index]} · ${daysUpTo(dayOf(summary.today))}</b>`];
  let categories: string[] | null = null;
  if (summary.totalMinor > 0) {
    const spent = `Потрачено ${approx(summary.hasUsd, som(summary.totalMinor))}`;
    head.push(summary.comparison ? `${spent} — ${comparisonWords(summary.comparison)}.` : `${spent}.`);
    if (summary.usdLeftOut) head.push(USD_LEFT_OUT);
    categories = summary.categories.map(categoryLine);
  } else {
    head.push(summary.usdLeftOut ? USD_LEFT_OUT : `Трат в ${MONTHS_IN[index]} пока нет.`);
  }
  return { text: blocks(head, categories), keyboard: appLinkRows('Открыть аналитику', options.analyticsUrl) };
}
