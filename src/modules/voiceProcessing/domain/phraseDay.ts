import { addDaysToDateOnly } from '../../../shared/domain/dates/dateOnly';
import { conservativeKeywordPattern } from '../../../shared/domain/semantics/semanticKeywords';

/** «сегодня», «вчера», «позавчера» — and in Uzbek and English: how many days before the day the phrase was said. */
const DAYS_BACK: Record<string, number> = {
  сегодня: 0, вчера: 1, позавчера: 2,
  bugun: 0, kecha: 1, бугун: 0, кеча: 1,
  today: 0, yesterday: 1,
};

const DAY_WORD = conservativeKeywordPattern(Object.keys(DAYS_BACK)).source;
// The word with the brackets, commas, colons and dashes around it: «такси (вчера) 18000», «вчера — такси 18000»
const DAY_WORD_PATTERN = new RegExp(`\\(\\s*${DAY_WORD}\\s*\\)|[\\s,:—–-]*${DAY_WORD}[\\s,:—–-]*`, 'giu');

/**
 * Any other day a phrase can name, in Russian, English and Uzbek — a weekday («в пн» too), «завтра», «неделю назад»,
 * «на прошлой неделе», «вчерашний», «на днях», «в выходные». A month alone is not here: «аренда на ноябрь» names a
 * period, and «5 ноября» holds a second number, which the fast paths leave to the AI anyway.
 */
const OTHER_DAY_PATTERN = conservativeKeywordPattern([
  'понедельник\\p{L}*', 'вторник\\p{L}*', 'сред[аыу]', 'четверг\\p{L}*', 'пятниц[аыу]', 'суббот[аыу]', 'воскресень[еяю]',
  'во? (?:пн|вт|ср|чт|пт|сб|вс)',
  'завтра', 'послезавтра', 'назад', 'прошл\\p{L}*', 'вчерашн\\p{L}*', 'позавчерашн\\p{L}*', 'на днях', 'выходн\\p{L}*',
  'monday\\p{L}*', 'tuesday\\p{L}*', 'wednesday\\p{L}*', 'thursday\\p{L}*', 'friday\\p{L}*', 'saturday\\p{L}*',
  'sunday\\p{L}*', 'tomorrow', 'last week',
  'dushanba\\p{L}*', 'seshanba\\p{L}*', 'chorshanba\\p{L}*', 'payshanba\\p{L}*', 'juma\\p{L}*', 'shanba\\p{L}*',
  'yakshanba\\p{L}*', 'ertaga', 'indinga', "o['‘’ʻ`]?tgan hafta\\p{L}*",
]);

export interface PhraseDay {
  /** The phrase without its day word. */
  text: string;
  /** YYYY-MM-DD. */
  date: string;
}

/**
 * The day a phrase names, for the text fast paths (FT-175): `today` — the day it was said — or a day or two before it
 * for «вчера» and «позавчера», whose word then leaves the phrase. Null when the phrase names any other day or two day
 * words: the AI reads those, counting from the same day.
 */
export function phraseDayOf(text: string, today: string): PhraseDay | null {
  if (OTHER_DAY_PATTERN.test(text)) return null;

  const words = text.match(DAY_WORD_PATTERN) ?? [];
  if (words.length > 1) return null;
  const [word] = words;
  if (!word) return { text, date: today };

  const daysBack = DAYS_BACK[word.replace(/[^\p{L}]/gu, '').toLocaleLowerCase('ru-RU')];
  return {
    text: text.replace(DAY_WORD_PATTERN, ' ').replace(/\s+/g, ' ').trim(),
    date: addDaysToDateOnly(today, -daysBack),
  };
}
