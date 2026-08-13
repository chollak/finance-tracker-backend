import { describe, it, expect } from 'vitest';
import { debtToViewModel } from './toViewModel';
import type { DebtStatus, DebtType } from '@/shared/types';

const baseDebt = {
  id: 'd1',
  userId: 'u1',
  personName: 'Азиз',
  amount: 1_000_000,
  remainingAmount: 1_000_000,
  type: 'owed_to_me' as DebtType,
  status: 'active' as DebtStatus,
  description: 'до зарплаты',
  date: '2026-08-01',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
} as any;

/**
 * Status colour must come from the four semantic roles. Blue is not one of
 * them, and raw palette classes bypass the token layer entirely.
 */
describe('debtToViewModel status colours', () => {
  const semanticRole = /^text-(success|warning|expense|destructive|foreground|muted-foreground)$/;

  it('uses a semantic role for an active debt, not a raw palette colour', () => {
    const vm = debtToViewModel({ ...baseDebt, status: 'active' });

    expect(vm._statusLabel).toBe('Активен');
    expect(vm._statusColor).toMatch(semanticRole);
  });

  it('marks a settled debt as success', () => {
    const vm = debtToViewModel({ ...baseDebt, status: 'paid' });

    expect(vm._statusLabel).toBe('Погашен');
    expect(vm._statusColor).toBe('text-success');
  });

  it('mutes a cancelled debt', () => {
    const vm = debtToViewModel({ ...baseDebt, status: 'cancelled' });

    expect(vm._statusLabel).toBe('Отменён');
    expect(vm._statusColor).toBe('text-muted-foreground');
  });

  it('never emits a raw Tailwind palette class', () => {
    for (const status of ['active', 'paid', 'cancelled'] as DebtStatus[]) {
      const vm = debtToViewModel({ ...baseDebt, status });
      expect(vm._statusColor).not.toMatch(/-(50|100|200|300|400|500|600|700|800|900)$/);
    }
  });
});
