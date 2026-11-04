import { ConflictError } from '../../../shared/domain/errors/AppError';
import { Category, CategoryType } from './category';

/**
 * The user already has a category of this type with this name (the unique (user, type, name) index): two requests at
 * once both found the name free and the other one was written first. The same 409 as a name the list shows taken (#270).
 */
export class CategoryNameTakenError extends ConflictError {
  constructor(name: string) {
    super(`Category «${name}» already exists`);
  }
}

export interface CategoryRepository {
  /** All of the user's categories, hidden included, by type then sort order. */
  findByUserId(userId: string): Promise<Category[]>;
  findById(id: string): Promise<Category | null>;
  /** Insert categories, skipping any that would repeat a (user, type, preset) or (user, type, name). */
  createManyIgnoringDuplicates(categories: Category[]): Promise<void>;
  /** Throws CategoryNameTakenError when the name is taken. */
  create(category: Category): Promise<Category>;
  /** Throws CategoryNameTakenError when the new name is taken. */
  update(id: string, changes: Partial<Pick<Category, 'name' | 'color' | 'isHidden' | 'sortOrder'>>): Promise<Category>;
  /** Highest sortOrder among the user's own (non-«Другое») categories of a type, or 0. */
  maxSortOrder(userId: string, type: CategoryType): Promise<number>;
  /**
   * Delete a category no record points at, deleted records included (FT-127: «Отменить» after «Категория
   * добавлена»). False when a record has it: such a category is hidden, never deleted.
   */
  deleteIfUnused(id: string): Promise<boolean>;
}
