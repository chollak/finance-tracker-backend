import { describe, it, expect } from 'vitest';
import { debtToViewModel } from './toViewModel';
import type { Debt } from '@/shared/types';

// FT-059: the debt status chip used raw Tailwind palette colors (blue/green/gray).
// Blue is not one of the four semantic roles (income/success, expense/destructive,
// warning, neutral chrome), so an active debt was coded with a color that means
// nothing in this design system. Status must map onto existing roles only.
function debt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: 'debt-1',
    userId: 'user-1',
    personName: 'Азиз',
    type: 'i_owe',
    originalAmount: 1000,
    remainingAmount: 1000,
    status: 'active',
    createdAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  } as Debt;
}

describe('debtToViewModel status color', () => {
  it('keeps an active debt in neutral chrome, not blue', () => {
    const viewModel = debtToViewModel(debt());

    expect(viewModel._statusLabel).toBe('Активен');
    expect(viewModel._statusColor).toBe('text-foreground');
  });

  it('marks a paid debt with the success role', () => {
    const viewModel = debtToViewModel(debt({ status: 'paid', remainingAmount: 0 }));

    expect(viewModel._statusLabel).toBe('Погашен');
    expect(viewModel._statusColor).toBe('text-success');
  });

  it('mutes a cancelled debt', () => {
    const viewModel = debtToViewModel(debt({ status: 'cancelled' }));

    expect(viewModel._statusLabel).toBe('Отменён');
    expect(viewModel._statusColor).toBe('text-muted-foreground');
  });

  it('never uses raw Tailwind palette colors for status', () => {
    const statuses: Debt['status'][] = ['active', 'paid', 'cancelled'];

    for (const status of statuses) {
      const { _statusColor } = debtToViewModel(debt({ status }));
      expect(_statusColor).not.toMatch(/-(?:\d{2,3})$/);
    }
  });
});
