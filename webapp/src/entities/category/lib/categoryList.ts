import type { Category, CategoryType } from '../model/types';

/** Categories a picker offers for a record of `type`: visible ones, in order, «Другое» last. */
export function pickableCategories(categories: readonly Category[] | undefined, type: CategoryType): Category[] {
  return (categories ?? [])
    .filter((category) => category.type === type && !category.isHidden)
    .sort((a, b) => Number(a.isOther) - Number(b.isOther) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'));
}

export function findCategory(categories: readonly Category[] | undefined, id: string | undefined): Category | undefined {
  return id ? categories?.find((category) => category.id === id) : undefined;
}

/** A name as typed, with spaces collapsed — as the server keeps it (FT-099). */
export function cleanCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Names are compared as the server compares them: regardless of case, «ё» and «е» the same letter (FT-099). */
export function categoryNameKey(name: string): string {
  return cleanCategoryName(name).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}
