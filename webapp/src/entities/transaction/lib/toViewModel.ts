import type { Transaction, TransactionSemanticType } from '@/shared/types';
import type { TransactionViewModel } from '../model/types';
import { formatTransactionAmount, formatTransactionDate } from '@/shared/lib/formatters';
import { getCategoryIcon, getCategoryColor } from '../../category/lib';
import { getSemanticTypeLabel, getSemanticTypeBadgeVariant, isNonExpenseMovement } from './semanticType';

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
    _categoryIcon: getCategoryIcon(transaction.category),
    _categoryColor: getCategoryColor(transaction.category),
    _amountColor: isIncome ? 'text-income' : 'text-expense',
    _typeLabel: isIncome ? 'Доход' : 'Расход',
    _semanticTypeLabel: getSemanticTypeLabel(semanticType),
    _semanticTypeBadgeVariant: getSemanticTypeBadgeVariant(semanticType),
    _isNonExpenseMovement: isNonExpenseMovement(semanticType),
  };
}
