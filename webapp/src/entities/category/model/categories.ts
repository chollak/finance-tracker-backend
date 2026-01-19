/**
 * Category definitions - synced with backend
 * Source of truth: src/shared/domain/entities/Category.ts
 *
 * Keep in sync with backend when adding/modifying categories.
 */

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  icon: string;
}

// =============================================================================
// EXPENSE CATEGORIES
// =============================================================================

export const EXPENSE_CATEGORIES: Category[] = [
  // Еда и напитки
  { id: 'food', name: 'Еда', type: 'expense', icon: '🍔' },
  { id: 'groceries', name: 'Продукты', type: 'expense', icon: '🛒' },
  { id: 'restaurants', name: 'Рестораны', type: 'expense', icon: '🍽️' },
  { id: 'coffee', name: 'Кофе', type: 'expense', icon: '☕' },

  // Транспорт
  { id: 'transport', name: 'Транспорт', type: 'expense', icon: '🚗' },
  { id: 'taxi', name: 'Такси', type: 'expense', icon: '🚕' },
  { id: 'public-transport', name: 'Общ. транспорт', type: 'expense', icon: '🚌' },
  { id: 'fuel', name: 'Топливо', type: 'expense', icon: '⛽' },

  // Жилье и коммунальные
  { id: 'utilities', name: 'Коммунальные', type: 'expense', icon: '💡' },
  { id: 'rent', name: 'Аренда', type: 'expense', icon: '🏠' },
  { id: 'internet', name: 'Интернет', type: 'expense', icon: '🌐' },

  // Покупки
  { id: 'shopping', name: 'Покупки', type: 'expense', icon: '🛍️' },
  { id: 'clothing', name: 'Одежда', type: 'expense', icon: '👔' },
  { id: 'electronics', name: 'Электроника', type: 'expense', icon: '📱' },

  // Развлечения
  { id: 'entertainment', name: 'Развлечения', type: 'expense', icon: '🎬' },
  { id: 'hobbies', name: 'Хобби', type: 'expense', icon: '🎮' },
  { id: 'sports', name: 'Спорт', type: 'expense', icon: '⚽' },

  // Здоровье
  { id: 'health', name: 'Здоровье', type: 'expense', icon: '🏥' },
  { id: 'pharmacy', name: 'Аптека', type: 'expense', icon: '💊' },
  { id: 'fitness', name: 'Фитнес', type: 'expense', icon: '🏋️' },

  // Образование
  { id: 'education', name: 'Образование', type: 'expense', icon: '📚' },
  { id: 'courses', name: 'Курсы', type: 'expense', icon: '🎓' },

  // Прочее
  { id: 'bills', name: 'Счета', type: 'expense', icon: '📄' },
  { id: 'subscriptions', name: 'Подписки', type: 'expense', icon: '📺' },
  { id: 'gifts-expense', name: 'Подарки', type: 'expense', icon: '🎁' },
  { id: 'other', name: 'Другое', type: 'expense', icon: '📦' },
];

// =============================================================================
// INCOME CATEGORIES
// =============================================================================

export const INCOME_CATEGORIES: Category[] = [
  { id: 'salary', name: 'Зарплата', type: 'income', icon: '💰' },
  { id: 'freelance', name: 'Фриланс', type: 'income', icon: '💼' },
  { id: 'investment', name: 'Инвестиции', type: 'income', icon: '📈' },
  { id: 'gift', name: 'Подарок', type: 'income', icon: '🎁' },
  { id: 'refund', name: 'Возврат', type: 'income', icon: '↩️' },
  { id: 'bonus', name: 'Бонус', type: 'income', icon: '🏆' },
  { id: 'other-income', name: 'Другое', type: 'income', icon: '📦' },
];

// =============================================================================
// UNIVERSAL CATEGORIES
// =============================================================================

export const UNIVERSAL_CATEGORIES: Category[] = [
  { id: 'transfer', name: 'Перевод', type: 'both', icon: '💸' },
  { id: 'debt', name: 'Долг', type: 'both', icon: '🤝' },
];

// =============================================================================
// ALL CATEGORIES
// =============================================================================

export const ALL_CATEGORIES = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
  ...UNIVERSAL_CATEGORIES,
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Gets category by ID
 */
export function getCategoryById(id: string): Category | undefined {
  return ALL_CATEGORIES.find((cat) => cat.id === id);
}

/**
 * Gets categories by type
 */
export function getCategoriesByType(type: 'income' | 'expense'): Category[] {
  return ALL_CATEGORIES.filter((cat) => cat.type === type || cat.type === 'both');
}

/**
 * Gets category icon by ID
 * Returns default icon if category not found
 */
export function getCategoryIcon(id: string): string {
  return getCategoryById(id)?.icon || '📦';
}

/**
 * Gets category name by ID
 * Returns the ID itself if category not found
 */
export function getCategoryName(id: string): string {
  return getCategoryById(id)?.name || id;
}
