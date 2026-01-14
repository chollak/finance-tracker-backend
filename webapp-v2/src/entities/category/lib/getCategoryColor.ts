// Category to color mapping (Tailwind classes)
const CATEGORY_COLORS: Record<string, string> = {
  // Food & Dining - Orange
  food: 'bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
  groceries: 'bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
  restaurants: 'bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
  coffee: 'bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',

  // Transportation - Blue
  transport: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  taxi: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  'public-transport': 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  fuel: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',

  // Shopping - Purple
  shopping: 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
  clothing: 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
  electronics: 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',

  // Entertainment - Pink
  entertainment: 'bg-pink-100 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400',
  hobbies: 'bg-pink-100 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400',
  sports: 'bg-pink-100 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400',

  // Bills & Utilities - Yellow
  bills: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400',
  utilities: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400',
  rent: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400',
  internet: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400',

  // Health - Red
  health: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  pharmacy: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  fitness: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',

  // Education - Indigo
  education: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400',
  courses: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400',

  // Income - Green
  salary: 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400',
  freelance: 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400',
  investment: 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400',
  gift: 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400',

  // Other - Gray
  other: 'bg-gray-100 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400',
  transfer: 'bg-gray-100 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400',
};

/**
 * Gets Tailwind color classes for a category
 * @param category - Category name
 * @returns Tailwind CSS classes for background and text color
 */
export function getCategoryColor(category: string): string {
  const normalized = category.toLowerCase().trim();
  return CATEGORY_COLORS[normalized] || 'bg-gray-100 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400';
}
