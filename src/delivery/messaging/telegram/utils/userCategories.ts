import { BotContext } from '../types';
import { resolveUserIdToUUID } from '../../../../shared/application/helpers/userIdResolver';
import { CategoryButton } from '../keyboards/categoryKeyboard';

/** Internal id of the user behind a bot update. */
export async function botUserId(ctx: BotContext): Promise<string> {
  return resolveUserIdToUUID(String(ctx.from?.id), ctx.modules.userModule);
}

/** The user's visible expense categories for the quick-add keyboard (FT-100); empty without the module. */
export async function quickAddCategories(ctx: BotContext, userId: string): Promise<CategoryButton[]> {
  const categoryModule = ctx.modules.categoryModule;
  if (!categoryModule) return [];
  const categories = await categoryModule.getCatalog().listForUser(userId);
  return categories
    .filter(category => category.type === 'expense' && !category.isHidden)
    .map(category => ({ id: category.id, name: category.name }));
}

/**
 * What a quick-add button points at: the user's category with that id, or — for buttons in messages
 * sent before FT-099 — the category an old static id moved into.
 */
export async function quickAddCategory(
  ctx: BotContext,
  userId: string,
  value: string
): Promise<{ categoryId?: string; category: string; name: string }> {
  const categoryModule = ctx.modules.categoryModule;
  if (!categoryModule) return { category: value, name: value };

  const catalog = categoryModule.getCatalog();
  const own = (await catalog.listForUser(userId)).find(category => category.id === value);
  if (own) return { categoryId: own.id, category: own.name, name: own.name };

  const resolved = await catalog.resolveForRecord({ userId, type: 'expense', category: value });
  return resolved.success
    ? { categoryId: resolved.data.id, category: resolved.data.name, name: resolved.data.name }
    : { category: value, name: value };
}
