import { Markup } from 'telegraf';
import { InlineKeyboardButton } from 'telegraf/types';
import { ComparedPeriod, DaySummary, MonthSummary } from '../../../../modules/notification/domain/dailySummary';
import { absoluteDate, amountDigits, amountWithUnit, escapeHtml, recordsWord } from './recordMessage';

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

/** «Продукты · 186 400». */
const categoryLine = (category: { name: string; amountMinor: number }) => `${escapeHtml(category.name)} · ${amountDigits(category.amountMinor, 'UZS')}`;

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
  const head = `С начала ${MONTHS_OF[monthIndex(month.month)]} — ${som(month.totalMinor)}`;
  return month.comparison ? `${head}, ${comparisonWords(month.comparison)}.` : `${head}.`;
}

/** A link to the Mini App in a row of its own: «Открыть Daftar ↗»; nothing when the Mini App is not configured. */
export function appLinkRows(label: string, url: string | undefined): InlineKeyboardButton[][] {
  return url ? [[Markup.button.webApp(`${label} ↗`, url)]] : [];
}

function dayTitle(day: string, today: string): string {
  return `<b>Итоги дня · ${absoluteDate(day, today)}</b>`;
}

/** Blocks of lines with an empty line between them. */
function blocks(...parts: Array<string[] | null>): string {
  return parts.filter((part): part is string[] => Boolean(part && part.length)).map(part => part.join('\n')).join('\n\n');
}

/**
 * The summary of a day — the evening notice (`scheduled`) and /today. A day without records: the evening asks
 * «Трат правда не было?» with «Да, не было»; /today says «Записей пока нет.»
 */
export function formatDaySummary(summary: DaySummary, options: { today: string; appUrl?: string; scheduled?: boolean }): BotNotice {
  const title = dayTitle(summary.day, options.today);
  if (summary.recordCount === 0) {
    if (!options.scheduled) return { text: `${title}\nЗаписей пока нет.`, keyboard: [] };
    return {
      text: blocks([title, 'Записей нет. Трат правда не было?'], ['<i>Если что-то было — просто напишите, например «обед 45к».</i>']),
      keyboard: [[Markup.button.callback('Да, не было', noSpendingCallback(summary.day))]],
    };
  }

  const head = [title];
  if (summary.expenseCount > 0) {
    head.push(`Потрачено ${som(summary.expenseMinor)} · ${recordsWord(summary.expenseCount)}`);
    if (summary.usdLeftOut) head.push(USD_LEFT_OUT);
  } else {
    // Income, a transfer or a record awaiting review: no spending to tell
    head.push(summary.usdLeftOut ? USD_LEFT_OUT : 'Трат не было.');
  }
  const month = monthLine(summary.month);
  return {
    text: blocks(head, summary.expenseCount > 0 ? summary.categories.map(categoryLine) : null, month ? [month] : null),
    keyboard: appLinkRows('Открыть Daftar', options.appUrl),
  };
}

/** «Да, не было» pressed: the question becomes the answer, without buttons. */
export function formatNoSpending(day: string, today: string): BotNotice {
  return { text: `${dayTitle(day, today)}\nОтметил: ${absoluteDate(day, today)} трат не было.`, keyboard: [] };
}

/** /month: «Октябрь · 1–14», what was spent against the same days before, the 3 largest categories. */
export function formatMonthSummary(summary: MonthSummary, options: { analyticsUrl?: string }): BotNotice {
  const index = monthIndex(summary.month);
  const head = [`<b>${MONTH_NAMES[index]} · ${daysUpTo(dayOf(summary.today))}</b>`];
  let categories: string[] | null = null;
  if (summary.totalMinor > 0) {
    const spent = `Потрачено ${som(summary.totalMinor)}`;
    head.push(summary.comparison ? `${spent} — ${comparisonWords(summary.comparison)}.` : `${spent}.`);
    if (summary.usdLeftOut) head.push(USD_LEFT_OUT);
    categories = summary.categories.map(categoryLine);
  } else {
    head.push(summary.usdLeftOut ? USD_LEFT_OUT : `Трат в ${MONTHS_IN[index]} пока нет.`);
  }
  return { text: blocks(head, categories), keyboard: appLinkRows('Открыть аналитику', options.analyticsUrl) };
}
