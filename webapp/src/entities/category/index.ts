// Category entity barrel export

// Model
export type { Category } from './model/categories';
export {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  UNIVERSAL_CATEGORIES,
  ALL_CATEGORIES,
  getCategoryById,
  getCategoriesByType,
  getCategoryName,
} from './model/categories';

// Lib
export { getCategoryIcon, getCategoryColor } from './lib';

// UI Components
export { CategoryBadge } from './ui/CategoryBadge';
export { CategoryIcon } from './ui/CategoryIcon';
