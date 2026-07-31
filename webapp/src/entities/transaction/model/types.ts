// Re-export transaction types from shared
export type {
  Transaction,
  CreateTransactionDTO,
  UpdateTransactionDTO,
  TransactionSemanticType,
} from '@/shared/types';

import type { Transaction } from '@/shared/types';
import type { BadgeProps } from '@/shared/ui/badge';

// ViewModel with formatted fields for UI
export interface TransactionViewModel extends Transaction {
  // Formatted fields with _ prefix (View Model Pattern)
  _formattedAmount: string;      // "-50 000 сўм" or "+2 000 000 сўм"
  _formattedDate: string;        // "Сегодня, 15:30" or "14 янв, 15:30"
  _categoryIcon: string;         // "🍔"
  _categoryColor: string;        // "bg-orange-100 text-orange-600"
  _amountColor: string;          // "text-income" or "text-expense"
  _typeLabel: string;            // "Доход" or "Расход"
  _semanticTypeLabel: string;            // "Долг", "Перевод себе", ...
  _semanticTypeBadgeVariant: NonNullable<BadgeProps['variant']>;
  _isNonExpenseMovement: boolean;        // true for movements excluded from expense/budget analytics
  _needsReview: boolean;                 // true when semanticType is uncertain and awaits user correction
}
