import type { BudgetSummary, BudgetPeriod } from '@/shared/types';
import type { BudgetViewModel } from '../model/types';
import { formatCurrency, formatBudgetUsage } from '@/shared/lib/formatters';

/**
 * Gets progress bar color based on percentage used
 */
function getProgressColor(percentageUsed: number, isOverBudget: boolean): string {
  if (isOverBudget) return 'bg-red-500';
  if (percentageUsed >= 90) return 'bg-orange-500';
  if (percentageUsed >= 75) return 'bg-yellow-500';
  return 'bg-green-500';
}

/**
 * Gets status text and color based on budget usage
 */
function getStatus(percentageUsed: number, isOverBudget: boolean) {
  if (isOverBudget) {
    return {
      text: 'Превышен',
      color: 'text-red-600 dark:text-red-400',
    };
  }

  if (percentageUsed >= 90) {
    return {
      text: 'Близко к лимиту',
      color: 'text-orange-600 dark:text-orange-400',
    };
  }

  if (percentageUsed >= 75) {
    return {
      text: 'Внимание',
      color: 'text-yellow-600 dark:text-yellow-400',
    };
  }

  return {
    text: 'На пути',
    color: 'text-green-600 dark:text-green-400',
  };
}

/**
 * Formats budget period to Russian
 */
function formatPeriod(period: BudgetPeriod): string {
  const PERIOD_LABELS: Record<string, string> = {
    weekly: 'Недельный',
    monthly: 'Месячный',
    quarterly: 'Квартальный',
    yearly: 'Годовой',
  };

  return PERIOD_LABELS[period] || period;
}

/**
 * Formats days remaining text
 */
function formatDaysRemaining(days: number): string {
  if (days === 0) return 'Последний день';
  if (days === 1) return '1 день остался';
  if (days <= 4) return `${days} дня осталось`;
  return `${days} дней осталось`;
}

/**
 * Transforms BudgetSummary to BudgetViewModel
 * Adds formatted fields with _ prefix for direct UI rendering
 */
export function budgetToViewModel(budget: BudgetSummary): BudgetViewModel {
  const status = getStatus(budget.percentageUsed, budget.isOverBudget);

  return {
    ...budget,
    _formattedAmount: formatCurrency(budget.amount),
    _formattedSpent: formatCurrency(budget.spent),
    _formattedRemaining: formatCurrency(Math.max(0, budget.remaining)),
    _percentageText: formatBudgetUsage(budget.spent, budget.amount),
    _progressColor: getProgressColor(budget.percentageUsed, budget.isOverBudget),
    _statusText: status.text,
    _statusColor: status.color,
    _daysRemainingText: formatDaysRemaining(budget.daysRemaining),
    _periodText: formatPeriod(budget.period),
  };
}
