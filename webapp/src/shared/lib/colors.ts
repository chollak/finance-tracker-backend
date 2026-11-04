/**
 * Semantic color utilities for finance-related UI
 * These use CSS variables defined in globals.css
 *
 * Following Design Guidelines:
 * - Green for income/success
 * - Red for expense/destructive
 * - Orange for warnings
 */

export type TransactionType = 'income' | 'expense';

/**
 * Get text color class for amount display
 * Positive = income (green), Negative = expense (red)
 */
export function getAmountColorClass(amount: number): string {
  if (amount > 0) return 'text-income';
  if (amount < 0) return 'text-expense';
  return 'text-foreground';
}

/**
 * Get color classes for transaction type
 */
export function getTransactionColorClasses(type: TransactionType) {
  return type === 'income'
    ? {
        text: 'text-income',
        bg: 'bg-income',
        bgMuted: 'bg-income-muted',
        hover: 'hover:bg-income/90',
        border: 'border-income',
      }
    : {
        text: 'text-expense',
        bg: 'bg-expense',
        bgMuted: 'bg-expense-muted',
        hover: 'hover:bg-expense/90',
        border: 'border-expense',
      };
}

/**
 * Semantic color map for direct use
 */
export const semanticColors = {
  income: {
    text: 'text-income',
    bg: 'bg-income',
    bgMuted: 'bg-income-muted',
    border: 'border-income',
  },
  expense: {
    text: 'text-expense',
    bg: 'bg-expense',
    bgMuted: 'bg-expense-muted',
    border: 'border-expense',
  },
  warning: {
    text: 'text-warning',
    bg: 'bg-warning',
    bgMuted: 'bg-warning-muted',
    border: 'border-warning',
  },
  success: {
    text: 'text-success',
    bg: 'bg-success',
    bgMuted: 'bg-success-muted',
    border: 'border-success',
  },
} as const;
