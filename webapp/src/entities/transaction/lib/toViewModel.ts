import type { Transaction, TransactionSemanticType } from '@/shared/types';
import type { TransactionViewModel } from '../model/types';
import { formatTransactionAmount, formatTransactionDate } from '@/shared/lib/formatters';
import { categoryInitial, categoryMarkClass } from '../../category/lib/display';
import { getSemanticTypeLabel, getSemanticTypeBadgeVariant, isNonExpenseMovement } from './semanticType';
import { shouldShowSemanticTypeBadge } from './transactionRowDisplay';

/**
 * Transforms Transaction to TransactionViewModel
 * Adds formatted fields with _ prefix for direct UI rendering
 */
export function transactionToViewModel(transaction: Transaction): TransactionViewModel {
  const isIncome = transaction.type === 'income';

  // Use createdAt for formatted date (includes time), fallback to date
  const dateForFormatting = transaction.createdAt || transaction.date;

  // Local/guest transactions may predate semanticType — fall back to income/expense.
  const semanticType: TransactionSemanticType = transaction.semanticType ?? (isIncome ? 'income' : 'expense');

  return {
    ...transaction,
    _formattedAmount: formatTransactionAmount(transaction.amount, transaction.type),
    _formattedDate: formatTransactionDate(dateForFormatting),
    // The first letter on the category's pastel colour — «Пастель» has no emoji (FT-100)
    _categoryIcon: categoryInitial(transaction.category),
    _categoryColor: categoryMarkClass(transaction.categoryColor),
    _amountColor: isIncome
      ? 'text-income'
      : isNonExpenseMovement(semanticType)
        ? 'text-muted-foreground'
        : 'text-expense',
    _typeLabel: isIncome ? 'Доход' : 'Расход',
    _semanticTypeLabel: getSemanticTypeLabel(semanticType),
    _semanticTypeBadgeVariant: getSemanticTypeBadgeVariant(semanticType),
    _showSemanticTypeBadge: shouldShowSemanticTypeBadge(semanticType),
    _isNonExpenseMovement: isNonExpenseMovement(semanticType),
    _needsReview: transaction.needsReview === true,
  };
}
