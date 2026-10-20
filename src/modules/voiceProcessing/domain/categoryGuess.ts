import { presetByKey, presetSynonyms } from '../../category/domain/categoryPresets';

/**
 * When a category is the AI's guess (FT-138, decision of 2026-10-20). The review shows «?» and the bot
 * «Покупки?» only for a category the AI chose itself. A category the record's words name — by the user's
 * name of it, by a word of the category dictionary, or by a word a learned pattern ties to it — is not a
 * guess, and neither is one the text paths read from the words without the AI.
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

/** The same word, or — for a stem of four letters or more — the same word with another ending. */
function sameWord(word: string, dictionaryWord: string): boolean {
  if (word === dictionaryWord) return true;
  const base = stem(dictionaryWord);
  return base.length >= MIN_STEM && word.startsWith(base);
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
 * record has the words of the AI's note and merchant for it that the phrase really has — a word the AI wrote
 * itself («Покупки на Uzum» for «uzum») does not name anything.
 */
export function recordWordsOf(phrase: string, item: { description?: string; merchant?: string }, recordCount: number): string {
  if (recordCount <= 1) return phrase;
  const inPhrase = new Set(wordsOf(phrase));
  return wordsOf(`${item.description ?? ''} ${item.merchant ?? ''}`).filter(word => inPhrase.has(word)).join(' ');
}
