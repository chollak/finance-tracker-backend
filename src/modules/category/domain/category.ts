/**
 * User categories (FT-099, decision Д5, docs/pastel/money-model.md → `categories`).
 *
 * Every user has their own expense and income categories: eight of each to start with, which they
 * can rename, recolour and hide. A record points at one by id; the name is only for display.
 */

export type CategoryType = 'expense' | 'income';
export const CATEGORY_TYPES: readonly CategoryType[] = ['expense', 'income'];

/** The eight pastel tokens of «Пастель» a category can take; see docs/pastel/design-system.md. */
export const CATEGORY_COLORS = ['peach', 'rose', 'sky', 'sand', 'lilac', 'mint', 'butter', 'mist'] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export const CATEGORY_NAME_MAX_LENGTH = 40;

export interface Category {
  id: string;
  userId: string;
  type: CategoryType;
  name: string;
  color: CategoryColor;
  isHidden: boolean;
  /** «Другое» of its type: the fallback for anything unrecognised; it cannot be hidden. */
  isOther: boolean;
  sortOrder: number;
  /** Key of the starter category this one came from (stable across renames); null for the user's own. */
  presetKey: string | null;
}

export function isCategoryColor(value: unknown): value is CategoryColor {
  return typeof value === 'string' && (CATEGORY_COLORS as readonly string[]).includes(value);
}

export function isCategoryType(value: unknown): value is CategoryType {
  return value === 'expense' || value === 'income';
}

/** Name as typed, with spaces collapsed. */
export function cleanCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Key for comparing names without regard to case. SQLite's `lower()` and `LIKE` fold only ASCII, so
 * Cyrillic is folded here; «ё» and «е» count as the same letter.
 */
export function categoryNameKey(name: string): string {
  return cleanCategoryName(name).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}
