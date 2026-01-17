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
export type AlertSeverity = 'critical' | 'warning' | 'info' | 'success';
export type BudgetStatus = 'safe' | 'warning' | 'danger' | 'exceeded';

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
 * Get progress bar color class based on budget percentage
 */
export function getProgressColorClass(percentage: number): string {
  if (percentage >= 100) return 'bg-expense';
  if (percentage >= 90) return 'bg-warning';
  if (percentage >= 75) return 'bg-warning/70';
  return 'bg-success';
}

/**
 * Get budget status from percentage
 */
export function getBudgetStatus(percentage: number): BudgetStatus {
  if (percentage >= 100) return 'exceeded';
  if (percentage >= 90) return 'danger';
  if (percentage >= 75) return 'warning';
  return 'safe';
}

/**
 * Get status badge colors for budget display
 */
export function getStatusColorClasses(percentage: number) {
  if (percentage >= 100) {
    return {
      text: 'text-expense',
      bg: 'bg-expense-muted',
      border: 'border-expense/30',
    };
  }
  if (percentage >= 90) {
    return {
      text: 'text-expense',
      bg: 'bg-expense-muted',
      border: 'border-expense/30',
    };
  }
  if (percentage >= 75) {
    return {
      text: 'text-warning',
      bg: 'bg-warning-muted',
      border: 'border-warning/30',
    };
  }
  return {
    text: 'text-success',
    bg: 'bg-success-muted',
    border: 'border-success/30',
  };
}

/**
 * Get alert severity colors
 */
export function getAlertColorClasses(severity: AlertSeverity) {
  const colorMap = {
    critical: {
      text: 'text-expense',
      bg: 'bg-expense-muted',
      icon: 'text-expense',
      border: 'border-expense/30',
    },
    warning: {
      text: 'text-warning',
      bg: 'bg-warning-muted',
      icon: 'text-warning',
      border: 'border-warning/30',
    },
    info: {
      text: 'text-foreground',
      bg: 'bg-muted',
      icon: 'text-muted-foreground',
      border: 'border-border',
    },
    success: {
      text: 'text-success',
      bg: 'bg-success-muted',
      icon: 'text-success',
      border: 'border-success/30',
    },
  };
  return colorMap[severity];
}

/**
 * Get financial health indicator colors
 */
export function getHealthColorClasses(score: number) {
  if (score >= 80) {
    return {
      text: 'text-success',
      bg: 'bg-success',
      label: 'Excellent',
    };
  }
  if (score >= 60) {
    return {
      text: 'text-success',
      bg: 'bg-success/70',
      label: 'Good',
    };
  }
  if (score >= 40) {
    return {
      text: 'text-warning',
      bg: 'bg-warning',
      label: 'Fair',
    };
  }
  return {
    text: 'text-expense',
    bg: 'bg-expense',
    label: 'Needs Attention',
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
