import type { BudgetSummary } from '@/shared/types';
import { formatCurrency, formatBudgetUsage } from '@/shared/lib/formatters';
import { pluralBudgets } from './plural';

/**
 * Aggregate over all budgets.
 * FT-055: the budgets page used to repeat every budget twice — once inside the
 * "Бюджеты" overview card and once in the list below. The overview now carries
 * only what the list cannot: the totals across all budgets.
 */
export interface BudgetTotalsViewModel {
  count: number;
  percentageUsed: number;
  isOverBudget: boolean;
  _formattedAmount: string;         // total limit
  _formattedSpent: string;          // total spent
  _remainingLabel: string;          // "Осталось" | "Перерасход"
  _remainingAmountText: string;
  _remainingColor: string;
  _percentageText: string;          // "62%"
  _progressColor: string;
  _attentionText: string;           // "1 бюджет превышен • 2 бюджета близко к лимиту"
  _attentionColor: string;
}

export function budgetsToTotals(budgets: BudgetSummary[]): BudgetTotalsViewModel {
  const amount = budgets.reduce((sum, b) => sum + b.amount, 0);
  const spent = budgets.reduce((sum, b) => sum + b.spent, 0);
  const remaining = amount - spent;
  const isOverBudget = spent > amount;
  const percentageUsed = amount > 0 ? Math.round((spent / amount) * 100) : 0;

  const overCount = budgets.filter((b) => b.isOverBudget).length;
  const nearCount = budgets.filter((b) => !b.isOverBudget && b.percentageUsed >= 80).length;

  const attentionParts: string[] = [];
  if (overCount > 0) {
    attentionParts.push(
      `${overCount} ${pluralBudgets(overCount)} ${overCount === 1 ? 'превышен' : 'превышены'}`
    );
  }
  if (nearCount > 0) {
    attentionParts.push(`${nearCount} ${pluralBudgets(nearCount)} близко к лимиту`);
  }

  // Red only for an actually exceeded budget; approaching the limit is a warning
  const attentionColor = overCount > 0
    ? 'text-expense'
    : nearCount > 0
    ? 'text-warning'
    : 'text-muted-foreground';

  return {
    count: budgets.length,
    percentageUsed,
    isOverBudget,
    _formattedAmount: formatCurrency(amount),
    _formattedSpent: formatCurrency(spent),
    _remainingLabel: isOverBudget ? 'Перерасход' : 'Осталось',
    _remainingAmountText: formatCurrency(Math.abs(remaining)),
    _remainingColor: isOverBudget
      ? 'text-expense'
      : percentageUsed >= 80
      ? 'text-warning'
      : 'text-success',
    _percentageText: formatBudgetUsage(spent, amount),
    _progressColor: isOverBudget
      ? 'bg-expense'
      : percentageUsed >= 75
      ? 'bg-warning'
      : 'bg-success',
    _attentionText: attentionParts.length > 0
      ? attentionParts.join(' • ')
      : 'Все бюджеты в пределах лимита',
    _attentionColor: attentionColor,
  };
}
