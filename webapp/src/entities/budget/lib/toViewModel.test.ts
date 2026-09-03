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

  it('marks 85% as near limit without using red text for a forecast/risk state', () => {
    const viewModel = budgetToViewModel(summary(85));

    expect(viewModel._statusText).toBe('Близко к лимиту');
    expect(viewModel._statusColor).toBe('text-warning');
    expect(viewModel._progressColor).toBe('bg-warning');
  });

  it('uses 80% as the inclusive near-limit boundary (79 / 80 / 81)', () => {
    expect(budgetToViewModel(summary(79))._statusText).toBe('Внимание');
    expect(budgetToViewModel(summary(80))._statusText).toBe('Близко к лимиту');
    expect(budgetToViewModel(summary(81))._statusText).toBe('Близко к лимиту');
  });

  it('marks an over-budget budget as exceeded', () => {
    const viewModel = budgetToViewModel(summary(120, { isOverBudget: true }));

    expect(viewModel._statusText).toBe('Превышен');
    expect(viewModel._statusColor).toBe('text-expense');
    expect(viewModel._forecastText).toBe('Лимит превышен');
    expect(viewModel._forecastStatus).toBe('exceeded');
  });
});

describe('budgetToViewModel period and forecast copy', () => {
  it('labels a shifted monthly window by the spending month and shows the exact range', () => {
    const viewModel = budgetToViewModel(summary(40, {
      startDate: '2026-07-31',
      endDate: '2026-08-30',
      daysRemaining: 19,
    }));

    expect(viewModel._periodText).toBe('Август 2026 • 31.07–30.08');
    expect(viewModel._timeContextText).toBe('Ещё 19 дней до 30 августа');
  });

  it('uses forecast wording instead of a deadline-looking "Закончится" label', () => {
    const viewModel = budgetToViewModel(summary(90, {
      amount: 1000,
      spent: 900,
      remaining: 100,
      daysRemaining: 10,
      isOverBudget: false,
    }));

    expect(viewModel._forecastText).toMatch(/^Риск: лимит закончится /);
    expect(viewModel._forecastStatus).toBe('risk');
  });

  it('keeps days remaining in one dedicated card line', () => {
    const viewModel = budgetToViewModel(summary(30, { daysRemaining: 1 }));

    expect(viewModel._daysRemainingText).toBe('1 день остался');
    expect(viewModel._timeContextText).toBe('Ещё 1 день до конца месяца');
  });
});
