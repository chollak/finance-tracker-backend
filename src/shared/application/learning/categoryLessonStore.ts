import { CategoryLesson } from '../../../modules/transaction/domain/categoryLessons';
import { merchantKey } from '../../../modules/voiceProcessing/domain/lessonWords';
import { LearnedPatterns, LearnedWord, LearningData, MerchantPattern } from './learningTypes';

/**
 * Lessons of category corrections in the learned patterns (FT-184). A phrase's words are counted one by one: a word
 * gives its category as a guess after one lesson and for sure from `MIN_WORD_LESSONS`. A payment's merchant is a merchant
 * pattern of exactly its `merchantKey`, which the latest correction moves. The seed's category patterns are not touched.
 */

/** A word gives its category for sure from this many lessons; with fewer, as a guess («Продукты?»). */
export const MIN_WORD_LESSONS = 2;

/** Whether a lesson has anything to teach: a phrase of numbers and service words, or a merchant «7777», has not. */
export function teachesAnything(lesson: CategoryLesson): boolean {
  return lesson.kind === 'words' ? lesson.words.length > 0 : lesson.merchant.length > 0;
}

export function withLesson(patterns: LearnedPatterns, lesson: CategoryLesson): LearnedPatterns {
  if (lesson.kind === 'merchant') {
    return { ...patterns, merchants: withMerchant(patterns.merchants, lesson.merchant, lesson.presetKey) };
  }
  const words = lesson.words.reduce((counts, word) => countedOnce(counts, word, lesson.presetKey, 1), patterns.words ?? []);
  return { ...patterns, words };
}

/** What the history keeps of a lesson: the record it came from and what it counted. */
export function historyEntryOf(lesson: CategoryLesson, timestamp: string): LearningData {
  const taught = lesson.kind === 'merchant' ? { merchant: lesson.merchant } : { lessonWords: [...lesson.words] };
  return {
    originalText: lesson.kind === 'merchant' ? lesson.merchant : lesson.words.join(' '),
    originalParsing: lesson.originalParsing,
    userCorrection: { category: lesson.presetKey },
    userId: lesson.userId,
    timestamp,
    confidence: lesson.originalParsing.confidence ?? 0.8,
    recordId: lesson.recordId,
    ...taught,
  };
}

/**
 * The patterns and history without the lessons of a record: each counted word one use less, each merchant back to the
 * latest correction of it left in the history, or gone. A record without lessons — never corrected, or corrected
 * before FT-184 — changes nothing.
 */
export function withoutLessonsOf(
  recordId: string,
  patterns: LearnedPatterns,
  history: LearningData[]
): { patterns: LearnedPatterns; history: LearningData[]; taken: number } {
  const taken = history.filter(entry => entry.recordId === recordId);
  if (taken.length === 0) return { patterns, history, taken: 0 };

  const rest = history.filter(entry => entry.recordId !== recordId);
  const words = taken.reduce(
    (counts, entry) => (entry.lessonWords ?? []).reduce(
      (current, word) => countedOnce(current, word, entry.userCorrection.category ?? '', -1), counts),
    patterns.words ?? []
  );
  const merchantKeys = [...new Set(taken.flatMap(entry => (entry.merchant ? [entry.merchant] : [])))];
  const merchants = merchantKeys.reduce((current, key) => merchantFromHistory(current, key, rest), patterns.merchants);
  return { patterns: { ...patterns, words, merchants }, history: rest, taken: taken.length };
}

/**
 * Words that give a starter category, by its key: for sure (`sure`) or as a guess. A word two categories were taught
 * gives neither.
 */
export function lessonWordsByCategory(words: readonly LearnedWord[], sure: boolean): Map<string, string[]> {
  const categoriesOf = new Map<string, LearnedWord[]>();
  for (const entry of words) {
    if (entry.uses > 0) categoriesOf.set(entry.word, [...(categoriesOf.get(entry.word) ?? []), entry]);
  }
  const byCategory = new Map<string, string[]>();
  for (const [word, entries] of categoriesOf) {
    if (entries.length !== 1) continue;
    const [{ category, uses }] = entries;
    if (sure !== uses >= MIN_WORD_LESSONS) continue;
    byCategory.set(category, [...(byCategory.get(category) ?? []), word]);
  }
  return byCategory;
}

/** The starter category of each learned merchant, by `merchantKey`. */
export function merchantCategories(merchants: readonly MerchantPattern[]): Map<string, string> {
  const categories = new Map<string, string>();
  for (const merchant of merchants) {
    if (!merchant.category) continue;
    for (const alias of merchant.aliases) {
      const key = merchantKey(alias);
      if (key) categories.set(key, merchant.category);
    }
  }
  return categories;
}

function countedOnce(words: readonly LearnedWord[], word: string, category: string, by: 1 | -1): LearnedWord[] {
  const isIt = (entry: LearnedWord) => entry.word === word && entry.category === category;
  const counted = words.some(isIt)
    ? words.map(entry => (isIt(entry) ? { ...entry, uses: entry.uses + by } : entry))
    : by > 0 ? [...words, { word, category, uses: by }] : [...words];
  return counted.filter(entry => entry.uses > 0);
}

function withMerchant(merchants: readonly MerchantPattern[], key: string, category: string): MerchantPattern[] {
  const known = merchants.find(merchant => merchant.normalizedName === key);
  if (!known) return [...merchants, { aliases: [key], normalizedName: key, category, usageCount: 1 }];
  return merchants.map(merchant => merchant === known
    ? {
      ...merchant,
      aliases: merchant.aliases.includes(key) ? merchant.aliases : [...merchant.aliases, key],
      category,
      usageCount: merchant.usageCount + 1,
    }
    : merchant);
}

function merchantFromHistory(merchants: readonly MerchantPattern[], key: string, history: readonly LearningData[]): MerchantPattern[] {
  const lessons = history.filter(entry => entry.merchant === key);
  const others = merchants.filter(merchant => merchant.normalizedName !== key);
  if (lessons.length === 0) return others;
  const category = lessons[lessons.length - 1].userCorrection.category;
  return [...others, { aliases: [key], normalizedName: key, category, usageCount: lessons.length }];
}
