import { describe, expect, it } from 'vitest';
import { budgetsToTotals } from './toTotals';
import type { BudgetSummary } from '@/shared/types';

function budget(overrides: Partial<BudgetSummary> = {}): BudgetSummary {
  return {
    id: 'budget-1',
    name: 'Еда',
    amount: 1_000_000,
    spent: 400_000,
    remaining: 600_000,
    percentageUsed: 40,
    isOverBudget: false,
    period: 'monthly',
    daysRemaining: 10,
    ...overrides,
  } as BudgetSummary;
}

describe('budgetsToTotals', () => {
  it('aggregates all budgets without returning per-budget duplicates', () => {
    const totals = budgetsToTotals([
      budget({ id: 'food', amount: 1_000_000, spent: 400_000, remaining: 600_000, percentageUsed: 40 }),
      budget({ id: 'taxi', amount: 500_000, spent: 250_000, remaining: 250_000, percentageUsed: 50 }),
    ]);

    expect(totals.count).toBe(2);
    expect(totals.percentageUsed).toBe(43);
    expect(totals._formattedSpent.replace(/\s/g, ' ')).toContain('650');
    expect(totals._formattedAmount.replace(/\s/g, ' ')).toContain('1 500');
    expect(totals._remainingLabel).toBe('Осталось');
    expect(totals._attentionText).toBe('Все бюджеты в пределах лимита');
  });

  it('uses warning for near-limit totals and red only for actual overspend', () => {
    const nearLimit = budgetsToTotals([
      budget({ id: 'food', amount: 1_000_000, spent: 850_000, remaining: 150_000, percentageUsed: 85 }),
    ]);

    expect(nearLimit._remainingColor).toBe('text-warning');
    expect(nearLimit._progressColor).toBe('bg-warning');
    expect(nearLimit._attentionText).toBe('1 бюджет близко к лимиту');
    expect(nearLimit._attentionColor).toBe('text-warning');

    const over = budgetsToTotals([
      budget({ id: 'food', amount: 1_000_000, spent: 1_100_000, remaining: -100_000, percentageUsed: 110, isOverBudget: true }),
    ]);

    expect(over._remainingLabel).toBe('Перерасход');
    expect(over._remainingColor).toBe('text-expense');
    expect(over._progressColor).toBe('bg-expense');
    expect(over._attentionText).toBe('1 бюджет превышен');
    expect(over._attentionColor).toBe('text-expense');
  });
});
