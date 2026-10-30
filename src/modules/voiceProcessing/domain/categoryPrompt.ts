import { CATEGORY_PRESETS, presetHints } from '../../category/domain/categoryPresets';
import { categoryNameKey } from '../../category/domain/category';
import { CategoryOfRecord, mentionsBareBrand } from './categoryGuess';

const HINTS_PER_CATEGORY = 8;

/** A category the AI may choose: the name to answer with and words that point at it (FT-099). */
export interface PromptCategory {
  type: 'income' | 'expense';
  name: string;
  hints: string[];
}

/** What the parser is told about one user. */
export interface AnalysisContext {
  /** The user's visible categories; the starter set when absent. */
  categories?: PromptCategory[];
  /** The user's current names of starter categories by key — learned patterns are shown in them. */
  presetNames?: Map<string, string>;
  /**
   * The day the phrase was said, YYYY-MM-DD on the user's calendar (FT-175): «вчера» and a weekday count from it,
   * and a record without a date gets it. Today when absent.
   */
  today?: string;
}

/** Where the text and voice use cases get the user's categories; implemented by the category module. */
export interface UserCategorySource {
  promptCategories(userId: string): Promise<PromptCategory[]>;
  presetNames(userId: string): Promise<Map<string, string>>;
  /** The user's visible categories with their starter keys, for the word rule of the text fast path (FT-143). */
  recordCategories(userId: string): Promise<CategoryOfRecord[]>;
}

/** The starter 8 + 8, for a parse without a known user. */
export function starterPromptCategories(): PromptCategory[] {
  return CATEGORY_PRESETS.map(preset => ({ type: preset.type, name: preset.name, hints: presetHints(preset) }));
}

/** The starter 8 + 8 as records see them, for a user whose categories cannot be read. */
export function starterRecordCategories(): CategoryOfRecord[] {
  return CATEGORY_PRESETS.map(preset => ({ type: preset.type, name: preset.name, presetKey: preset.key }));
}

/**
 * A hint that is itself the name of a category of the list («кэшбэк» under «Возврат») would mislead, and so would
 * one with a bare brand in it (FT-150): with «яндекс го» under «Транспорт» the AI put «яндекс плюс» there too.
 */
function lines(categories: PromptCategory[], names: Set<string>): string {
  return categories
    .map(category => {
      const hints = category.hints
        .filter(hint => !names.has(categoryNameKey(hint)) && !mentionsBareBrand(hint))
        .slice(0, HINTS_PER_CATEGORY);
      return `  - ${category.name}${hints.length > 0 ? ` (${hints.join(', ')})` : ''}`;
    })
    .join('\n');
}

/**
 * The category part of the prompt: the user's own names, so a renamed or added category is chosen by
 * name, with the old categories' words as hints for the starter ones. «Другое» is the fallback.
 */
export function buildCategoryPrompt(categories: PromptCategory[] = starterPromptCategories()): string {
  const expense = categories.filter(category => category.type === 'expense');
  const income = categories.filter(category => category.type === 'income');
  const names = new Set(categories.map(category => categoryNameKey(category.name)));
  return `КАТЕГОРИИ РАСХОДОВ (в поле "category" — название ровно как здесь):
${lines(expense, names)}

КАТЕГОРИИ ДОХОДОВ:
${lines(income, names)}

Если ни одна категория не подходит — "Другое".`;
}

/** The expense categories alone, for the category of a card payment (FT-176): a payment is never income. */
export function buildExpenseCategoryPrompt(categories: PromptCategory[] = starterPromptCategories()): string {
  const expense = categories.filter(category => category.type === 'expense');
  const names = new Set(categories.map(category => categoryNameKey(category.name)));
  return `КАТЕГОРИИ РАСХОДОВ (в поле "category" — название ровно как здесь):
${lines(expense, names)}

Если ни одна категория не подходит — "Другое".`;
}
