import { Category, CategoryType } from './category';

export interface CategoryRepository {
  /** All of the user's categories, hidden included, by type then sort order. */
  findByUserId(userId: string): Promise<Category[]>;
  findById(id: string): Promise<Category | null>;
  /** Insert categories, skipping any that would repeat a (user, type, preset) or (user, type, name). */
  createManyIgnoringDuplicates(categories: Category[]): Promise<void>;
  create(category: Category): Promise<Category>;
  update(id: string, changes: Partial<Pick<Category, 'name' | 'color' | 'isHidden' | 'sortOrder'>>): Promise<Category>;
  /** Highest sortOrder among the user's own (non-«Другое») categories of a type, or 0. */
  maxSortOrder(userId: string, type: CategoryType): Promise<number>;
}
