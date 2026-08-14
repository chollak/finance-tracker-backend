import { describe, it, expect } from 'vitest';
import { budgetToViewModel } from './toViewModel';
import type { BudgetSummary } from '@/shared/types';

const budget = (over: Partial<BudgetSummary> = {}): BudgetSummary => ({
  id: 'b1',
  userId: 'u1',
  name: 'Еда',
  amount: 400_000,
  spent: 292_000,
  remaining: 108_000,
  percentageUsed: 73,
  isOverBudget: false,
  period: 'monthly',
  daysRemaining: 19,
  startDate: '2026-07-31',
  endDate: '2026-08-30',
  categoryIds: ['food'],
  ...over,
} as BudgetSummary);

describe('период бюджета подписан по тем тратам, которые в него попадают', () => {
  it('месяц берётся из окна периода, а не из даты начала', () => {
    // Окно 31.07–30.08: почти целиком август, поэтому «июль» вводит в заблуждение.
    const vm = budgetToViewModel(budget());

    expect(vm._periodText).not.toContain('июль');
    expect(vm._periodText.toLowerCase()).toContain('август');
  });

  it('период внутри одного месяца подписан этим месяцем', () => {
    const vm = budgetToViewModel(budget({ startDate: '2026-08-01', endDate: '2026-08-31' }));

    expect(vm._periodText.toLowerCase()).toContain('август');
  });

  it('период без дат остаётся просто названием периода', () => {
    const vm = budgetToViewModel(
      budget({ startDate: undefined, endDate: undefined } as Partial<BudgetSummary>)
    );

    expect(vm._periodText).toBe('Месячный');
  });
});

describe('оставшиеся дни', () => {
  // Дублирование срока — забота карточки: она рисовала и контекст, и подпись.
  // Модель обязана лишь дать обе формулировки согласованными.
  it('контекст и короткая подпись говорят об одном сроке', () => {
    const vm = budgetToViewModel(budget());

    expect(vm._timeContextText).toContain('19');
    expect(vm._daysRemainingText).toContain('19');
  });
});

describe('прогноз выгорания не выдаёт себя за срок', () => {
  it('формулируется как прогноз, а не как дедлайн', () => {
    const vm = budgetToViewModel(budget({ spent: 300_000, remaining: 100_000, daysRemaining: 10 }));

    if (vm._velocityText) {
      expect(vm._velocityText).not.toMatch(/^Закончится/);
      expect(vm._velocityText).toMatch(/такими темпами|хватит|превышен/i);
    }
  });

  it('превышенный бюджет говорит прямо', () => {
    const vm = budgetToViewModel(budget({ spent: 500_000, remaining: -100_000, isOverBudget: true, percentageUsed: 125 }));

    expect(vm._velocityText).toBe('Бюджет превышен');
    expect(vm._velocityStatus).toBe('danger');
  });
});
