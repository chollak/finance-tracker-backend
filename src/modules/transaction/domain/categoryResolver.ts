import { Result } from '../../../shared/domain/types/Result';

/** The category a record ends up in (FT-099). */
export interface ResolvedCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  /** Starter category key; stable across renames, used by learning. Null for the user's own categories. */
  presetKey: string | null;
  isOther: boolean;
}

export interface CategoryResolutionInput {
  userId: string;
  /** Type of the record; the category must be of the same type. */
  type: 'income' | 'expense';
  /** Picked by id (new clients). Must belong to the user. */
  categoryId?: string;
  /** Old id, name or alias (old clients, the bot, the AI parser); unrecognised → «Другое». */
  category?: string;
  /** Automatic paths (AI, text fast paths) never put a record into a hidden category. */
  visibleOnly?: boolean;
}

/**
 * Port to the category module: where a record being written goes. Implemented by
 * `CategoryCatalog` (modules/category); the transaction module knows only this interface.
 */
export interface CategoryResolver {
  resolveForRecord(input: CategoryResolutionInput): Promise<Result<ResolvedCategory>>;
}
