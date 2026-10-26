import type { PastelColor } from '@/shared/lib/pastel/categoryColors';

export type CategoryType = 'expense' | 'income';

/** A user's category as `GET /api/categories` returns it (FT-099, docs/pastel/api.md). */
export interface Category {
  id: string;
  type: CategoryType;
  name: string;
  color: PastelColor;
  isHidden: boolean;
  /** «Другое» of its type: always last, never hidden. */
  isOther: boolean;
  sortOrder: number;
  /** Starter category key, stable across renames; null for the user's own. */
  presetKey: string | null;
}

/** What the categories screen changes (FT-127): any of the name, the colour and whether it is hidden. */
export type CategoryPatch = Partial<Pick<Category, 'name' | 'color' | 'isHidden'>>;

/** A category the user adds (FT-127). */
export type NewCategory = Pick<Category, 'type' | 'name' | 'color'>;
