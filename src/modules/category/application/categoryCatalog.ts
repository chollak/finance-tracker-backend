import { randomUUID } from 'crypto';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { NotFoundError, ValidationError } from '../../../shared/domain/errors/AppError';
import { CategoryResolver, CategoryResolutionInput, ResolvedCategory } from '../../transaction/domain/categoryResolver';
import { Category, categoryNameKey } from '../domain/category';
import { CATEGORY_PRESETS, presetByKey, presetForLegacyCategory, presetHints } from '../domain/categoryPresets';
import { CategoryRepository } from '../domain/categoryRepository';
import { PromptCategory, UserCategorySource } from '../../voiceProcessing/domain/categoryPrompt';

function toResolved(category: Category): ResolvedCategory {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    presetKey: category.presetKey,
    isOther: category.isOther,
  };
}

/**
 * The user's categories: starter ones are created on first need, and any value a writer sends — an
 * id, a name, an old static id or alias — is resolved to one of them (FT-099).
 */
export class CategoryCatalog implements CategoryResolver, UserCategorySource {
  constructor(private repository: CategoryRepository) {}

  /** All of the user's categories, hidden included; the starter set is created if missing. */
  async listForUser(userId: string): Promise<Category[]> {
    const existing = await this.repository.findByUserId(userId);
    const presetCount = existing.filter(category => category.presetKey !== null).length;
    if (presetCount >= CATEGORY_PRESETS.length) return existing;

    await this.repository.createManyIgnoringDuplicates(
      CATEGORY_PRESETS.map(preset => ({
        id: randomUUID(),
        userId,
        type: preset.type,
        name: preset.name,
        color: preset.color,
        isHidden: false,
        isOther: preset.isOther,
        sortOrder: preset.sortOrder,
        presetKey: preset.key,
      }))
    );
    return this.repository.findByUserId(userId);
  }

  async resolveForRecord(input: CategoryResolutionInput): Promise<Result<ResolvedCategory>> {
    const categories = await this.listForUser(input.userId);
    const ofType = categories.filter(category => category.type === input.type);
    const other = ofType.find(category => category.isOther)!;
    const usable = (category: Category | undefined): Category | undefined =>
      category && !(input.visibleOnly && category.isHidden) ? category : undefined;

    if (input.categoryId) {
      const picked = categories.find(category => category.id === input.categoryId);
      if (!picked) {
        return ResultHelper.failure(new NotFoundError('Category', input.categoryId));
      }
      if (picked.type !== input.type) {
        return ResultHelper.failure(new ValidationError(
          `Category «${picked.name}» is for ${picked.type === 'income' ? 'income' : 'expenses'}, the record is ${input.type === 'income' ? 'income' : 'an expense'}`,
          'categoryId'
        ));
      }
      return ResultHelper.success(toResolved(picked));
    }

    const text = input.category?.trim() ?? '';
    if (text) {
      // The user's own name first — it may be a renamed starter or a category they added
      const byName = usable(ofType.find(category => categoryNameKey(category.name) === categoryNameKey(text)));
      if (byName) return ResultHelper.success(toResolved(byName));

      // Then old ids, old names and their aliases, through the starter category they moved into
      const preset = presetForLegacyCategory(text, input.type);
      const byPreset = usable(ofType.find(category => category.presetKey === preset.key));
      if (byPreset) return ResultHelper.success(toResolved(byPreset));
    }

    return ResultHelper.success(toResolved(other));
  }

  /** Visible categories with hint words, for the AI prompt. */
  async promptCategories(userId: string): Promise<PromptCategory[]> {
    const categories = await this.listForUser(userId);
    return categories
      .filter(category => !category.isHidden)
      .map(category => {
        const preset = category.presetKey ? presetByKey(category.presetKey, category.type) : undefined;
        return { type: category.type, name: category.name, hints: preset ? presetHints(preset) : [] };
      });
  }

  /** The user's current name for each starter key of a type — used to show learned patterns. */
  async presetNames(userId: string): Promise<Map<string, string>> {
    const categories = await this.listForUser(userId);
    const names = new Map<string, string>();
    for (const category of categories) {
      if (category.presetKey && !category.isHidden) names.set(category.presetKey, category.name);
    }
    return names;
  }
}
