import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { Transaction } from '../domain/transactionEntity';
import { CategoryResolver, ResolvedCategory } from '../domain/categoryResolver';

/**
 * The category to write when a record is edited (FT-099), or undefined to leave it as it is.
 *
 * - A new `categoryId` or a legacy `category` value is resolved for the record's (possibly new) type.
 * - A type change without a category moves the record to the category of the same name in the new
 *   type — «Другое» stays «Другое» — or to «Другое» of that type, so a record never keeps a category
 *   of the other type.
 */
export async function resolveCategoryForUpdate(
  resolver: CategoryResolver | undefined,
  existing: Transaction,
  request: { type?: 'income' | 'expense'; category?: string; categoryId?: string }
): Promise<Result<ResolvedCategory | undefined>> {
  if (!resolver) return ResultHelper.success(undefined);

  const type = request.type ?? existing.type;
  const categoryGiven = request.categoryId !== undefined || request.category !== undefined;
  const typeChanged = request.type !== undefined && request.type !== existing.type;
  if (!categoryGiven && !typeChanged) return ResultHelper.success(undefined);

  const resolved = await resolver.resolveForRecord({
    userId: existing.userId,
    type,
    categoryId: request.categoryId,
    category: categoryGiven ? request.category : existing.category,
  });
  if (!resolved.success) return ResultHelper.failure(resolved.error);
  return ResultHelper.success(resolved.data);
}
