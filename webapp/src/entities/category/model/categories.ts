// Static category definitions
export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  icon: string;
}

// Expense categories
export const EXPENSE_CATEGORIES: Category[] = [
  { id: 'food', name: 'Еда', type: 'expense', icon: '🍔' },
  { id: 'groceries', name: 'Продукты', type: 'expense', icon: '🛒' },
  { id: 'restaurants', name: 'Рестораны', type: 'expense', icon: '🍽️' },
  { id: 'coffee', name: 'Кофе', type: 'expense', icon: '☕' },
  { id: 'transport', name: 'Транспорт', type: 'expense', icon: '🚗' },
  { id: 'taxi', name: 'Такси', type: 'expense', icon: '🚕' },
  { id: 'public-transport', name: 'Общ. транспорт', type: 'expense', icon: '🚌' },
  { id: 'fuel', name: 'Топливо', type: 'expense', icon: '⛽' },
  { id: 'shopping', name: 'Покупки', type: 'expense', icon: '🛍️' },
  { id: 'clothing', name: 'Одежда', type: 'expense', icon: '👔' },
  { id: 'electronics', name: 'Электроника', type: 'expense', icon: '📱' },
  { id: 'entertainment', name: 'Развлечения', type: 'expense', icon: '🎬' },
  { id: 'hobbies', name: 'Хобби', type: 'expense', icon: '🎮' },
  { id: 'sports', name: 'Спорт', type: 'expense', icon: '⚽' },
  { id: 'bills', name: 'Счета', type: 'expense', icon: '📄' },
  { id: 'utilities', name: 'Коммунальные', type: 'expense', icon: '💡' },
  { id: 'rent', name: 'Аренда', type: 'expense', icon: '🏠' },
  { id: 'internet', name: 'Интернет', type: 'expense', icon: '🌐' },
  { id: 'health', name: 'Здоровье', type: 'expense', icon: '🏥' },
  { id: 'pharmacy', name: 'Аптека', type: 'expense', icon: '💊' },
  { id: 'fitness', name: 'Фитнес', type: 'expense', icon: '🏋️' },
  { id: 'education', name: 'Образование', type: 'expense', icon: '📚' },
  { id: 'courses', name: 'Курсы', type: 'expense', icon: '🎓' },
  { id: 'other', name: 'Другое', type: 'expense', icon: '📦' },
];

// Income categories
export const INCOME_CATEGORIES: Category[] = [
  { id: 'salary', name: 'Зарплата', type: 'income', icon: '💰' },
  { id: 'freelance', name: 'Фриланс', type: 'income', icon: '💼' },
  { id: 'investment', name: 'Инвестиции', type: 'income', icon: '📈' },
  { id: 'gift', name: 'Подарок', type: 'income', icon: '🎁' },
  { id: 'other', name: 'Другое', type: 'income', icon: '📦' },
];

// Universal categories (can be income or expense)
export const UNIVERSAL_CATEGORIES: Category[] = [
  { id: 'transfer', name: 'Перевод', type: 'both', icon: '💸' },
];

// All categories combined
export const ALL_CATEGORIES = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
  ...UNIVERSAL_CATEGORIES,
];

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
