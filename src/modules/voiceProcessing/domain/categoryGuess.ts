import { presetByKey, presetSynonyms } from '../../category/domain/categoryPresets';

/**
 * When a category is a guess (FT-138, decision of 2026-10-20). The review shows «?» and the bot «Покупки?»
 * when no word of the record names its category — by the user's name of it, by a word of the category
 * dictionary, or by a word a learned pattern ties to it. So a category the AI chose itself is a guess, and
 * so is «Другое» for a word nothing recognised (decided 2026-10-20 on review); a category the words gave is
 * not, and neither is one the record's kind sets on a fast path (a transfer goes to «Другое»).
 */

/** Learned words of the starter categories, by starter key: what users' corrections taught the parser. */
export interface LearnedCategoryWords {
  learnedCategoryWords(): Promise<ReadonlyMap<string, readonly string[]>>;
}

export interface CategoryOfRecord {
  /** The user's name of the category. */
  name: string;
  type: 'income' | 'expense';
  /** The starter category it came from; null for the user's own, unknown when it was not resolved. */
  presetKey: string | null;
}

/** Shortest stem that may match a longer word: «продукт» finds «продуктов», «коф» does not find «кофта». */
const MIN_STEM = 4;

/** Longest ending after the stem: an inflection («продукт|ов», «обед|али»), not another word («плат|форма»). */
const MAX_ENDING = 3;

/**
 * Dictionary words matched only as written: their stem starts everyday words of another meaning, and the
 * ending alone cannot tell them apart («обед|али» is right, «оплат|ил» is not). «оплатил» is not «оплата»,
 * «дорого» not «дорога», «другу» not «другое», «по курсу» not «курсы».
 */
const WHOLE_WORD_ONLY = new Set(['оплата', 'дорога', 'другое', 'курсы']);

/**
 * Words of a phrase that say what happened to the money, how much or when — not what it went on. A correction
 * teaches every word of its phrase, so a learned pattern holds them too («потратил», «деньги», «купил» in
 * the shipped seed); they name no category.
 */
const GENERIC_WORDS = [
  // paying and buying
  'купил', 'купить', 'покупал', 'потратил', 'потратить', 'тратил', 'заплатил', 'оплатил', 'платил', 'отдал',
  'взял', 'брал', 'заказал',
  // money and amounts
  'деньги', 'денег', 'сум', 'сумма', 'тысяча', 'тыс', 'млн', 'миллион', 'доллар', 'бакс',
  // when
  'вчера', 'сегодня', 'завтра', 'позавчера', 'утром', 'днем', 'вечером', 'ночью', 'сейчас',
  // small words
  'для', 'без', 'под', 'над', 'при', 'про', 'через', 'после', 'около', 'это', 'мне', 'меня', 'себе', 'все',
  'еще', 'уже', 'там', 'тут', 'как', 'так',
];

/**
 * Brands of many services (FT-150): alone they name no category — «яндекс плюс» is a subscription, «uber eats»
 * food, «яндекс такси» a ride. The dictionary has none of them as a word of its own, and a learned pattern does
 * not tie one to a category either: a correction teaches every word of its phrase, and a learning file may
 * still hold «yandex» of the seed it was copied from. So a bare brand goes to the AI; a merchant alias with more
 * words («yandex go») still names its category.
 */
const BARE_BRANDS = ['яндекс', 'yandex', 'uber'];

function fold(value: string): string {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

/** The words of a text, folded; «мастер-класс» is two words. */
export function wordsOf(text: string): string[] {
  return fold(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function stem(word: string): string {
  return word.replace(/[аеиоуыэюяйь]+$/u, '');
}

/**
 * The same word, or — for a stem of four letters or more — the same word with another short ending:
 * «продуктов» for «продукты», «обедали» for «обед».
 */
function sameWord(word: string, dictionaryWord: string): boolean {
  if (word === dictionaryWord) return true;
  if (WHOLE_WORD_ONLY.has(dictionaryWord)) return false;
  const base = stem(dictionaryWord);
  return base.length >= MIN_STEM && word.startsWith(base) && word.length - base.length <= MAX_ENDING;
}

/** A dictionary word or phrase («yandex go») among the words, whole words only: «чай» is not in «случайно». */
function hasWord(words: readonly string[], dictionaryWord: string): boolean {
  const phrase = wordsOf(dictionaryWord);
  if (phrase.length === 0) return false;
  for (let start = 0; start + phrase.length <= words.length; start += 1) {
    if (phrase.every((part, offset) => sameWord(words[start + offset], part))) return true;
  }
  return false;
}

/** Whether the words name the category: its name, a dictionary word of its starter, a learned word. */
export function categoryNamedIn(text: string, category: CategoryOfRecord, learnedWords: readonly string[] = []): boolean {
  const words = wordsOf(text);
  const preset = category.presetKey ? presetByKey(category.presetKey, category.type) : undefined;
  const dictionary = [category.name, ...(preset ? presetSynonyms(preset) : []), ...learnedWords];
  return dictionary.some(word => hasWord(words, word));
}

/**
 * The words that belong to one record. A phrase of one record is all its own. In a phrase of several, the
 * record has the phrase's words that the AI's note or merchant for it has too, also with another ending
 * (note «продукты» for «продуктов»). A word the AI wrote itself («Покупки на Uzum» for «uzum») does not
 * name anything.
 */
export function recordWordsOf(phrase: string, item: { description?: string; merchant?: string }, recordCount: number): string {
  if (recordCount <= 1) return phrase;
  const noteWords = wordsOf(`${item.description ?? ''} ${item.merchant ?? ''}`);
  return wordsOf(phrase)
    .filter(word => noteWords.some(note => sameWord(word, note) || sameWord(note, word)))
    .join(' ');
}

/** A bare brand of many services, in any ending: «яндекс», «яндекса», «Uber» — not «yandex go». */
function isBareBrand(text: string): boolean {
  const words = wordsOf(text);
  return words.length === 1 && BARE_BRANDS.some(brand => sameWord(words[0], brand));
}

/** A word of a learned pattern that names nothing: generic, a bare brand, too short, or with digits («25к»). */
function namesNothing(word: string): boolean {
  return word.length < 3
    || /\p{N}/u.test(word)
    || GENERIC_WORDS.some(generic => sameWord(word, generic))
    || isBareBrand(word);
}

/** Learned patterns as the guess rule reads them: the starter key and the words tied to it. */
export interface LearnedPatternsByKey {
  /** Keywords of category patterns: the words of the phrases users corrected into the category. */
  categories: ReadonlyArray<{ key: string; keywords: readonly string[] }>;
  /** Aliases of merchants that have a category. */
  merchants: ReadonlyArray<{ key: string; aliases: readonly string[] }>;
}

/**
 * Which learned words name a category (FT-138 review). A merchant alias does («uzum market»), unless it is a
 * bare number or a bare brand («яндекс», FT-150). A keyword of a category pattern does only when it points at
 * that category: not a generic word (`GENERIC_WORDS`: «купил», «деньги», «вчера»), not a bare brand, not a short
 * word or one with digits, and not a word the patterns of two categories share.
 */
export function namingWordsOf(patterns: LearnedPatternsByKey): Map<string, string[]> {
  const keysOfKeyword = new Map<string, Set<string>>();
  const keywordsByKey = patterns.categories.map(({ key, keywords }) => {
    const words = keywords.flatMap(wordsOf).filter(word => !namesNothing(word));
    for (const word of words) keysOfKeyword.set(word, (keysOfKeyword.get(word) ?? new Set()).add(key));
    return { key, words };
  });

  const named = new Map<string, string[]>();
  const add = (key: string, word: string) => {
    const list = named.get(key) ?? [];
    if (!list.includes(word)) list.push(word);
    named.set(key, list);
  };
  for (const { key, words } of keywordsByKey) {
    for (const word of words) if (keysOfKeyword.get(word)!.size === 1) add(key, word);
  }
  for (const { key, aliases } of patterns.merchants) {
    for (const alias of aliases) if (/\p{L}/u.test(alias) && !isBareBrand(alias)) add(key, alias);
  }
  return named;
}
