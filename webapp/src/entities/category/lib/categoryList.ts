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
