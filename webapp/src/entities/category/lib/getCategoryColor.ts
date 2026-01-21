// Category to color mapping (Tailwind classes)
const CATEGORY_COLORS: Record<string, string> = {
  // Food & Dining - Orange
  food: 'bg-orange-100 text-orange-600',
  groceries: 'bg-orange-100 text-orange-600',
  restaurants: 'bg-orange-100 text-orange-600',
  coffee: 'bg-orange-100 text-orange-600',

  // Transportation - Blue
  transport: 'bg-blue-100 text-blue-600',
  taxi: 'bg-blue-100 text-blue-600',
  'public-transport': 'bg-blue-100 text-blue-600',
  fuel: 'bg-blue-100 text-blue-600',

  // Shopping - Purple
  shopping: 'bg-purple-100 text-purple-600',
  clothing: 'bg-purple-100 text-purple-600',
  electronics: 'bg-purple-100 text-purple-600',

  // Entertainment - Pink
  entertainment: 'bg-pink-100 text-pink-600',
  hobbies: 'bg-pink-100 text-pink-600',
  sports: 'bg-pink-100 text-pink-600',

  // Bills & Utilities - Yellow
  bills: 'bg-yellow-100 text-yellow-600',
  utilities: 'bg-yellow-100 text-yellow-600',
  rent: 'bg-yellow-100 text-yellow-600',
  internet: 'bg-yellow-100 text-yellow-600',

  // Health - Red
  health: 'bg-red-100 text-red-600',
  pharmacy: 'bg-red-100 text-red-600',
  fitness: 'bg-red-100 text-red-600',

  // Education - Indigo
  education: 'bg-indigo-100 text-indigo-600',
  courses: 'bg-indigo-100 text-indigo-600',

  // Income - Green
  salary: 'bg-green-100 text-green-600',
  freelance: 'bg-green-100 text-green-600',
  investment: 'bg-green-100 text-green-600',
  gift: 'bg-green-100 text-green-600',
  refund: 'bg-green-100 text-green-600',
  bonus: 'bg-green-100 text-green-600',
  'other-income': 'bg-green-100 text-green-600',

  // Subscriptions - Violet
  subscriptions: 'bg-violet-100 text-violet-600',

  // Gifts (expense) - Rose
  'gifts-expense': 'bg-rose-100 text-rose-600',

  // Debt - Amber
  debt: 'bg-amber-100 text-amber-600',

  // Other - Gray
  other: 'bg-gray-100 text-gray-600',
  transfer: 'bg-gray-100 text-gray-600',
};

/**
 * Gets Tailwind color classes for a category
 * @param category - Category name
 * @returns Tailwind CSS classes for background and text color
 */
export function getCategoryColor(category: string): string {
  const normalized = category.toLowerCase().trim();
  return CATEGORY_COLORS[normalized] || 'bg-gray-100 text-gray-600';
}
