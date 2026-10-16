import { Markup } from 'telegraf';

/** A category button: the user's own category, shown by name (no emoji in «Пастель»). */
export interface CategoryButton {
  id: string;
  name: string;
}

const BUTTONS_PER_ROW = 3;

/**
 * Quick-add keyboard from the user's visible expense categories (FT-100). Callback data is
 * `quickadd:<categoryId>`; buttons in old messages carry the static ids of before FT-099 and still
 * work — the category resolver maps them.
 */
export function quickCategoryKeyboard(categories: CategoryButton[]) {
  const rows = [];
  for (let i = 0; i < categories.length; i += BUTTONS_PER_ROW) {
    rows.push(
      categories.slice(i, i + BUTTONS_PER_ROW).map(category => Markup.button.callback(category.name, `quickadd:${category.id}`))
    );
  }
  return Markup.inlineKeyboard(rows);
}
