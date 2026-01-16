import { Markup } from 'telegraf';
import { RU } from '../i18n/ru';

/**
 * Creates an inline keyboard with quick category buttons
 * Categories are arranged in rows of 4
 */
export function quickCategoryKeyboard() {
  const categories = RU.quickCategories.categories;

  // Create rows of 4 buttons each
  const rows = [];
  for (let i = 0; i < categories.length; i += 4) {
    rows.push(
      categories.slice(i, i + 4).map(cat =>
        Markup.button.callback(`${cat.emoji} ${cat.name}`, `quickadd:${cat.id}`)
      )
    );
  }

  return Markup.inlineKeyboard(rows);
}

/**
 * Get category info by id
 */
export function getCategoryById(id: string) {
  return RU.quickCategories.categories.find(cat => cat.id === id);
}

/**
 * Get category display text (emoji + name)
 */
export function getCategoryDisplay(id: string): string {
  const cat = getCategoryById(id);
  return cat ? `${cat.emoji} ${cat.name}` : id;
}
