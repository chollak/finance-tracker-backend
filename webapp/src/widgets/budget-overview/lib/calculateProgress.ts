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
 */
export function getProgressColor(percentage: number): string {
  if (percentage >= 90) return 'bg-red-500';
  if (percentage >= 75) return 'bg-orange-500';
  if (percentage >= 50) return 'bg-yellow-500';
  return 'bg-green-500';
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
 */
export function getStatusColor(budget: BudgetSummary): string {
  const percentage = calculateProgress(budget);

  if (percentage >= 100) return 'text-red-600 bg-red-50';
  if (percentage >= 90) return 'text-orange-600 bg-orange-50';
  if (percentage >= 75) return 'text-yellow-600 bg-yellow-50';
  return 'text-green-600 bg-green-50';
}
