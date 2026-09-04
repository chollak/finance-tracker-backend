import { format, addDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { BudgetSummary, BudgetPeriod } from '@/shared/types';
import type { BudgetViewModel, BudgetForecastStatus } from '../model/types';
import { formatCurrency, formatBudgetUsage } from '@/shared/lib/formatters';
import { pluralDays } from '@/shared/lib/plural';

/**
 * Genitive period labels used in "до конца ..." phrases
 */
const PERIOD_END_LABELS: Record<string, string> = {
  weekly: 'недели',
  monthly: 'месяца',
  quarterly: 'квартала',
  yearly: 'года',
};

/**
 * Gets progress bar color based on percentage used
 * Uses semantic design tokens.
 * FT-055: red (`bg-expense`) is reserved for an actually exceeded budget —
 * everything approaching the limit is a warning, not a failure.
 */
function getProgressColor(percentageUsed: number, isOverBudget: boolean): string {
  if (isOverBudget) return 'bg-expense';
  if (percentageUsed >= 75) return 'bg-warning';
  return 'bg-success';
}

/**
 * Gets status text and color based on budget usage
 * Uses semantic design tokens.
 * FT-053 fixed the thresholds (>= 80 is nearLimit, matching the backend);
 * FT-055 keeps the thresholds but reserves red for the exceeded case only.
 */
function getStatus(percentageUsed: number, isOverBudget: boolean) {
  if (isOverBudget) {
    return {
      text: 'Превышен',
      color: 'text-expense',
    };
  }

  if (percentageUsed >= 80) {
    return {
      text: 'Близко к лимиту',
      color: 'text-warning',
    };
  }

  if (percentageUsed >= 75) {
    return {
      text: 'Внимание',
      color: 'text-warning',
    };
  }

  return {
    text: 'На пути',
    color: 'text-success',
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
 * Parses the current budget window, or null when the API did not send it
 */
function parsePeriodRange(budget: BudgetSummary): { start: Date; end: Date } | null {
  if (!budget.startDate || !budget.endDate) return null;

  const start = new Date(budget.startDate);
  const end = new Date(budget.endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  return { start, end };
}

/**
 * The month the spending actually belongs to.
 * A monthly window that starts on 31.07 and ends on 30.08 collects August
 * spending, so it must be labelled "Август", not "Июль" (FT-055).
 */
function formatSpendingMonth(start: Date, end: Date): string {
  const middle = new Date((start.getTime() + end.getTime()) / 2);
  const label = format(middle, 'LLLL yyyy', { locale: ru });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Period line for the card header.
 * Monthly budgets are labelled by the month their spending belongs to;
 * the exact window is always spelled out so the label cannot contradict it.
 * e.g. "Август 2026 • 31.07–30.08"
 */
function formatPeriodText(budget: BudgetSummary): string {
  const range = parsePeriodRange(budget);
  if (!range) return formatPeriod(budget.period);

  const { start, end } = range;
  const rangeText = `${format(start, 'dd.MM')}–${format(end, 'dd.MM')}`;

  if (budget.period === 'monthly') {
    return `${formatSpendingMonth(start, end)} • ${rangeText}`;
  }

  return `${formatPeriod(budget.period)} • ${rangeText}`;
}

/**
 * Formats days remaining text (used by the compact list row)
 */
function formatDaysRemaining(days: number): string {
  if (days <= 0) return 'Последний день';
  const verb = pluralDays(days) === 'день' ? 'остался' : 'осталось';
  return `${days} ${pluralDays(days)} ${verb}`;
}

/**
 * The single "how much time is left" line of the card.
 * Names the closing date explicitly so it cannot be confused with the
 * burn-down forecast shown below it (FT-055).
 * e.g. "Ещё 19 дней до 30 августа"
 */
function formatTimeContext(budget: BudgetSummary): string {
  if (budget.daysRemaining <= 0) return 'Последний день периода';

  const daysText = `Ещё ${budget.daysRemaining} ${pluralDays(budget.daysRemaining)}`;
  const range = parsePeriodRange(budget);

  if (range) {
    return `${daysText} до ${format(range.end, 'd MMMM', { locale: ru })}`;
  }

  return `${daysText} до конца ${PERIOD_END_LABELS[budget.period] || 'периода'}`;
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
 * Burn-down forecast — when the budget runs out at the current spending rate.
 * FT-055: the wording says out loud that it is a forecast ("Прогноз" / "Риск"),
 * and only an actually exceeded budget gets the `exceeded` (red) status.
 */
function calculateForecast(budget: BudgetSummary): {
  dailyRate: number;
  runoutDate: string | null;
  forecastText: string | null;
  forecastStatus: BudgetForecastStatus;
} {
  const today = new Date();

  // Calculate total days and days elapsed using period and daysRemaining
  const totalDays = getPeriodTotalDays(budget.period);
  const daysElapsed = totalDays - budget.daysRemaining;

  // Calculate end date from daysRemaining
  const endDate = addDays(today, budget.daysRemaining);

  const dailyRate = daysElapsed > 0 ? budget.spent / daysElapsed : 0;

  // Already over budget: a fact, not a forecast — this is the one red case
  if (budget.isOverBudget) {
    return {
      dailyRate,
      runoutDate: null,
      forecastText: 'Лимит превышен',
      forecastStatus: 'exceeded',
    };
  }

  // Need at least 1 day of data
  if (daysElapsed <= 0 || budget.spent <= 0) {
    return {
      dailyRate: 0,
      runoutDate: null,
      forecastText: null,
      forecastStatus: null,
    };
  }

  // Calculate projected runout date
  const daysUntilRunout = budget.remaining / dailyRate;
  const projectedRunoutDate = addDays(today, Math.floor(daysUntilRunout));
  const runoutDateStr = format(projectedRunoutDate, 'd MMM', { locale: ru });

  if (projectedRunoutDate < endDate) {
    // Will run out before the period ends — a risk, not a deadline
    return {
      dailyRate,
      runoutDate: runoutDateStr,
      forecastText: `Риск: лимит закончится ${runoutDateStr}`,
      forecastStatus: 'risk',
    };
  }

  return {
    dailyRate,
    runoutDate: runoutDateStr,
    forecastText: `Прогноз: хватит до конца ${PERIOD_END_LABELS[budget.period] || 'периода'}`,
    forecastStatus: 'on-track',
  };
}

/**
 * Transforms BudgetSummary to BudgetViewModel
 * Adds formatted fields with _ prefix for direct UI rendering
 */
export function budgetToViewModel(budget: BudgetSummary): BudgetViewModel {
  const status = getStatus(budget.percentageUsed, budget.isOverBudget);
  const forecast = calculateForecast(budget);

  // Actionable headline: what the user can do right now
  const overspentAmount = Math.max(0, budget.spent - budget.amount);
  const remainingLabel = budget.isOverBudget ? 'Перерасход' : 'Осталось';
  const remainingAmountText = formatCurrency(
    budget.isOverBudget ? overspentAmount : Math.max(0, budget.remaining)
  );

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
    _periodText: formatPeriodText(budget),
    // Actionable headline
    _remainingLabel: remainingLabel,
    _remainingAmountText: remainingAmountText,
    _remainingColor: status.color,
    _timeContextText: formatTimeContext(budget),
    // Burn-down forecast
    _dailySpendingRate: forecast.dailyRate,
    _projectedRunoutDate: forecast.runoutDate,
    _forecastText: forecast.forecastText,
    _forecastStatus: forecast.forecastStatus,
  };
}
