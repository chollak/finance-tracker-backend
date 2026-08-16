import { describe, it, expect } from 'vitest';
import { budgetToViewModel } from './toViewModel';
import type { BudgetSummary } from '@/shared/types';

// FT-053: the "Близко к лимиту" badge on a budget card must mark exactly the budgets
// the backend counts as nearLimit (percentageUsed >= 80 and not over budget), so
// "Что важно сейчас" on Home and the budget cards tell the same story.
function summary(percentageUsed: number, overrides: Partial<BudgetSummary> = {}): BudgetSummary {
  return {
    id: `budget-${percentageUsed}`,
    name: `Budget ${percentageUsed}`,
    amount: 1000,
    spent: percentageUsed * 10,
    remaining: 1000 - percentageUsed * 10,
    percentageUsed,
    isOverBudget: percentageUsed > 100,
    period: 'monthly',
    daysRemaining: 10,
    ...overrides,
  } as BudgetSummary;
}

describe('budgetToViewModel status badge', () => {
  it('keeps a 48% budget on track', () => {
    expect(budgetToViewModel(summary(48))._statusText).toBe('На пути');
  });

  it('marks 85% as near limit', () => {
    expect(budgetToViewModel(summary(85))._statusText).toBe('Близко к лимиту');
  });

  it('uses 80% as the inclusive near-limit boundary (79 / 80 / 81)', () => {
    expect(budgetToViewModel(summary(79))._statusText).toBe('Внимание');
    expect(budgetToViewModel(summary(80))._statusText).toBe('Близко к лимиту');
    expect(budgetToViewModel(summary(81))._statusText).toBe('Близко к лимиту');
  });

  it('marks an over-budget budget as exceeded', () => {
    expect(budgetToViewModel(summary(120, { isOverBudget: true }))._statusText).toBe('Превышен');
  });
});
