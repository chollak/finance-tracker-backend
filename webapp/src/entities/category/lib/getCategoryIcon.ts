// Category to icon mapping
const CATEGORY_ICONS: Record<string, string> = {
  // Food & Dining
  food: '🍔',
  groceries: '🛒',
  restaurants: '🍽️',
  coffee: '☕',

  // Transportation
  transport: '🚗',
  taxi: '🚕',
  'public-transport': '🚌',
  fuel: '⛽',

  // Shopping
  shopping: '🛍️',
  clothing: '👔',
  electronics: '📱',

  // Entertainment
  entertainment: '🎬',
  hobbies: '🎮',
  sports: '⚽',

  // Bills & Utilities
  bills: '📄',
  utilities: '💡',
  rent: '🏠',
  internet: '🌐',

  // Health
  health: '🏥',
  pharmacy: '💊',
  fitness: '🏋️',

  // Education
  education: '📚',
  courses: '🎓',

  // Income
  salary: '💰',
  freelance: '💼',
  investment: '📈',
  gift: '🎁',

  // Other
  other: '📦',
  transfer: '💸',
  debt: '🤝',
};

/**
 * Gets icon emoji for a category
 * @param category - Category name
 * @returns Icon emoji (default: 📦)
 */
export function getCategoryIcon(category: string): string {
  const normalized = category.toLowerCase().trim();
  return CATEGORY_ICONS[normalized] || '📦';
}
