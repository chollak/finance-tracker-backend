import { addDaysToDateOnly } from '../../../shared/domain/dates/dateOnly';
import { conservativeKeywordPattern } from '../../../shared/domain/semantics/semanticKeywords';

/** «сегодня», «вчера», «позавчера»: how many days before the day the phrase was said. */
const DAYS_BACK: Record<string, number> = { сегодня: 0, вчера: 1, позавчера: 2 };

const DAY_WORD_PATTERN = conservativeKeywordPattern(Object.keys(DAYS_BACK), 'giu');

/** Any other day a phrase can name — a weekday, a month, «завтра», «неделю назад», «на прошлой неделе». */
const OTHER_DAY_PATTERN = conservativeKeywordPattern([
  'понедельник\\p{L}*', 'вторник\\p{L}*', 'сред[аыу]', 'четверг\\p{L}*', 'пятниц[аыу]', 'суббот[аыу]', 'воскресень[еяю]',
  'январ\\p{L}*', 'феврал\\p{L}*', 'март[аеу]?', 'апрел\\p{L}*', 'ма[йяе]', 'июн\\p{L}*', 'июл\\p{L}*', 'август\\p{L}*',
  'сентябр\\p{L}*', 'октябр\\p{L}*', 'ноябр\\p{L}*', 'декабр\\p{L}*',
  'завтра', 'послезавтра', 'назад', 'прошл\\p{L}*',
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

  return {
    text: text.replace(DAY_WORD_PATTERN, ' ').replace(/\s+/g, ' ').trim(),
    date: addDaysToDateOnly(today, -DAYS_BACK[word.toLocaleLowerCase('ru-RU')]),
  };
}
