import { format, differenceInDays, addDays } from 'date-fns';
import { ru } from 'date-fns/locale';
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
 * Get total days in budget period
 */
function getPeriodTotalDays(period: BudgetPeriod): number {
  switch (period) {
    case 'weekly': return 7;
    case 'monthly': return 30;
    case 'quarterly': return 90;
    case 'yearly': return 365;
    default: return 30;
  }
}

/**
 * Calculate velocity prediction - when budget will run out at current spending rate
 * Works with or without startDate/endDate fields
 */
function calculateVelocityPrediction(budget: BudgetSummary): {
  dailyRate: number;
  runoutDate: string | null;
  velocityText: string | null;
  velocityStatus: 'on-track' | 'warning' | 'danger' | null;
} {
  const today = new Date();

  // Calculate total days and days elapsed using period and daysRemaining
  const totalDays = getPeriodTotalDays(budget.period);
  const daysElapsed = totalDays - budget.daysRemaining;

  // Calculate end date from daysRemaining
  const endDate = addDays(today, budget.daysRemaining);

  // Need at least 1 day of data
  if (daysElapsed <= 0 || budget.spent <= 0) {
    return {
      dailyRate: 0,
      runoutDate: null,
      velocityText: null,
      velocityStatus: null,
    };
  }

  // Calculate daily spending rate
  const dailyRate = budget.spent / daysElapsed;

  // Already over budget
  if (budget.isOverBudget) {
    return {
      dailyRate,
      runoutDate: null,
      velocityText: 'Бюджет превышен',
      velocityStatus: 'danger',
    };
  }

  // Calculate projected runout date
  const daysUntilRunout = budget.remaining / dailyRate;
  const projectedRunoutDate = addDays(today, Math.floor(daysUntilRunout));

  // Format the date
  const runoutDateStr = format(projectedRunoutDate, 'd MMM', { locale: ru });

  // Determine velocity status
  let velocityStatus: 'on-track' | 'warning' | 'danger' = 'on-track';
  let velocityText: string;

  if (projectedRunoutDate < endDate) {
    // Will run out before end of period
    const daysDiff = differenceInDays(endDate, projectedRunoutDate);
    if (daysDiff > 3) {
      velocityStatus = 'danger';
      velocityText = `Закончится ${runoutDateStr}`;
    } else {
      velocityStatus = 'warning';
      velocityText = `Закончится ${runoutDateStr}`;
    }
  } else {
    // On track to finish within budget
    velocityStatus = 'on-track';
    velocityText = `Хватит до конца периода`;
  }

  return {
    dailyRate,
    runoutDate: runoutDateStr,
    velocityText,
    velocityStatus,
  };
}

/**
 * Transforms BudgetSummary to BudgetViewModel
 * Adds formatted fields with _ prefix for direct UI rendering
 */
export function budgetToViewModel(budget: BudgetSummary): BudgetViewModel {
  const status = getStatus(budget.percentageUsed, budget.isOverBudget);
  const velocity = calculateVelocityPrediction(budget);

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
    // Velocity prediction
    _dailySpendingRate: velocity.dailyRate,
    _projectedRunoutDate: velocity.runoutDate,
    _velocityText: velocity.velocityText,
    _velocityStatus: velocity.velocityStatus,
  };
}
