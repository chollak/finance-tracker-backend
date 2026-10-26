import { randomUUID } from 'crypto';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { BusinessLogicError, ConflictError, NotFoundError, ValidationError } from '../../../shared/domain/errors/AppError';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import {
  CATEGORY_COLORS,
  CATEGORY_NAME_MAX_LENGTH,
  Category,
  CategoryColor,
  CategoryType,
  categoryNameKey,
  cleanCategoryName,
  isCategoryColor,
  isCategoryType,
} from '../domain/category';
import { CategoryRepository } from '../domain/categoryRepository';
import { CategoryCatalog } from './categoryCatalog';

const logger = getLogger(LogCategory.TRANSACTION);

function checkName(value: unknown): Result<string, ValidationError> {
  if (typeof value !== 'string' || !cleanCategoryName(value)) {
    return ResultHelper.failure(new ValidationError('name is required', 'name'));
  }
  const name = cleanCategoryName(value);
  if (name.length > CATEGORY_NAME_MAX_LENGTH) {
    return ResultHelper.failure(new ValidationError(`name must be at most ${CATEGORY_NAME_MAX_LENGTH} characters`, 'name'));
  }
  return ResultHelper.success(name);
}

function checkColor(value: unknown): Result<CategoryColor, ValidationError> {
  return isCategoryColor(value)
    ? ResultHelper.success(value)
    : ResultHelper.failure(new ValidationError(`color must be one of: ${CATEGORY_COLORS.join(', ')}`, 'color'));
}

/** A name is free when no other category of the same user and type has it, regardless of case. */
function nameTaken(categories: Category[], type: CategoryType, name: string, exceptId?: string): Category | undefined {
  const key = categoryNameKey(name);
  return categories.find(category => category.type === type && category.id !== exceptId && categoryNameKey(category.name) === key);
}

export class ListCategoriesUseCase {
  constructor(private catalog: CategoryCatalog) {}

  async execute(input: { userId: string; type?: unknown }): Promise<Result<Category[]>> {
    if (input.type !== undefined && !isCategoryType(input.type)) {
      return ResultHelper.failure(new ValidationError('type must be expense or income', 'type'));
    }
    try {
      const categories = await this.catalog.listForUser(input.userId);
      return ResultHelper.success(input.type ? categories.filter(category => category.type === input.type) : categories);
    } catch (error) {
      logger.error('Failed to list categories', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to list categories'));
    }
  }
}

export class CreateCategoryUseCase {
  constructor(private catalog: CategoryCatalog, private repository: CategoryRepository) {}

  async execute(input: { userId: string; body: Record<string, unknown> }): Promise<Result<Category>> {
    const { type } = input.body;
    if (!isCategoryType(type)) {
      return ResultHelper.failure(new ValidationError('type must be expense or income', 'type'));
    }
    const name = checkName(input.body.name);
    if (!name.success) return name;
    const color = checkColor(input.body.color);
    if (!color.success) return color;

    try {
      const categories = await this.catalog.listForUser(input.userId);
      const taken = nameTaken(categories, type, name.data);
      if (taken) {
        return ResultHelper.failure(new ConflictError(`Category «${taken.name}» already exists`));
      }
      const sortOrder = (await this.repository.maxSortOrder(input.userId, type)) + 10;
      const created = await this.repository.create({
        id: randomUUID(),
        userId: input.userId,
        type,
        name: name.data,
        color: color.data,
        isHidden: false,
        isOther: false,
        sortOrder,
        presetKey: null,
      });
      return ResultHelper.success(created);
    } catch (error) {
      logger.error('Failed to create category', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to create category'));
    }
  }
}

const EDITABLE = ['name', 'color', 'isHidden'];

export class UpdateCategoryUseCase {
  constructor(private catalog: CategoryCatalog, private repository: CategoryRepository) {}

  /** Rename, recolour or hide one of the user's categories. «Другое» can be renamed and recoloured, not hidden. */
  async execute(input: { userId: string; categoryId: string; body: Record<string, unknown> }): Promise<Result<Category>> {
    const fields = Object.keys(input.body);
    const unknown = fields.filter(field => !EDITABLE.includes(field));
    if (fields.length === 0 || unknown.length > 0) {
      return ResultHelper.failure(new ValidationError(
        unknown.length > 0 ? `${unknown.join(', ')} cannot be changed` : 'Send name, color or isHidden'
      ));
    }

    try {
      const categories = await this.catalog.listForUser(input.userId);
      const category = categories.find(item => item.id === input.categoryId);
      if (!category) {
        return ResultHelper.failure(new NotFoundError('Category', input.categoryId));
      }

      const changes: { name?: string; color?: CategoryColor; isHidden?: boolean } = {};
      if (input.body.name !== undefined) {
        const name = checkName(input.body.name);
        if (!name.success) return name;
        const taken = nameTaken(categories, category.type, name.data, category.id);
        if (taken) return ResultHelper.failure(new ConflictError(`Category «${taken.name}» already exists`));
        changes.name = name.data;
      }
      if (input.body.color !== undefined) {
        const color = checkColor(input.body.color);
        if (!color.success) return color;
        changes.color = color.data;
      }
      if (input.body.isHidden !== undefined) {
        if (typeof input.body.isHidden !== 'boolean') {
          return ResultHelper.failure(new ValidationError('isHidden must be true or false', 'isHidden'));
        }
        if (input.body.isHidden && category.isOther) {
          return ResultHelper.failure(new ValidationError('«Другое» cannot be hidden', 'isHidden'));
        }
        changes.isHidden = input.body.isHidden;
      }

      return ResultHelper.success(await this.repository.update(category.id, changes));
    } catch (error) {
      logger.error('Failed to update category', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to update category'));
    }
  }
}

export class DeleteCategoryUseCase {
  constructor(private catalog: CategoryCatalog, private repository: CategoryRepository) {}

  /**
   * «Отменить» right after «Категория добавлена» (FT-127, board «Новая категория»): a category the user added and no
   * record has gone into, deleted records included, is taken back. A starter category and «Другое» are hidden or
   * renamed, never deleted (400); one with records is hidden, not deleted (409).
   */
  async execute(input: { userId: string; categoryId: string }): Promise<Result<{ id: string }>> {
    try {
      const categories = await this.catalog.listForUser(input.userId);
      const category = categories.find(item => item.id === input.categoryId);
      if (!category) return ResultHelper.failure(new NotFoundError('Category', input.categoryId));
      if (category.isOther || category.presetKey !== null) {
        return ResultHelper.failure(new ValidationError('Only a category the user added can be deleted', 'categoryId'));
      }
      if (!(await this.repository.deleteIfUnused(category.id))) {
        return ResultHelper.failure(new ConflictError('A category with records is hidden, not deleted'));
      }
      return ResultHelper.success({ id: category.id });
    } catch (error) {
      logger.error('Failed to delete category', error as Error);
      return ResultHelper.failure(new BusinessLogicError('Failed to delete category'));
    }
  }
}
