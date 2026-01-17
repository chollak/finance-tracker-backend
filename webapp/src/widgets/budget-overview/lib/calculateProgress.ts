import type { BudgetSummary } from '@/shared/types';

/**
 * Calculate budget progress percentage
 */
export function calculateProgress(budget: BudgetSummary): number {
  if (budget.amount === 0) return 0;
  return Math.round((budget.spent / budget.amount) * 100);
}

/**
 * Get progress bar color based on percentage
 * Uses semantic design tokens
 */
export function getProgressColor(percentage: number): string {
  if (percentage >= 90) return 'bg-expense';
  if (percentage >= 75) return 'bg-warning';
  if (percentage >= 50) return 'bg-warning/70';
  return 'bg-success';
}

/**
 * Get status text based on budget state
 */
export function getBudgetStatus(budget: BudgetSummary): string {
  const percentage = calculateProgress(budget);

  if (percentage >= 100) return 'Превышен';
  if (percentage >= 90) return 'Критично';
  if (percentage >= 75) return 'Внимание';
  return 'В норме';
}

/**
 * Get status color class
 * Uses semantic design tokens
 */
export function getStatusColor(budget: BudgetSummary): string {
  const percentage = calculateProgress(budget);

  if (percentage >= 100) return 'text-expense bg-expense-muted';
  if (percentage >= 90) return 'text-expense bg-expense-muted';
  if (percentage >= 75) return 'text-warning bg-warning-muted';
  return 'text-success bg-success-muted';
}
