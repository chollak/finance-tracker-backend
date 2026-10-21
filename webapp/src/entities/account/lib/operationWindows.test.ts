import { describe, expect, it } from 'vitest';
import type { AccountOperations } from '../model/types';
import { firstOperationsWindow, mergeOperationWindows, nextOperationsWindow, OPERATIONS_WINDOW_DAYS } from './operationWindows';

const ACCOUNT: AccountOperations['account'] = {
  id: 'card', name: 'Карта', kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-01-01', isHidden: false, sortOrder: 20, balanceMinor: 0, hasOperations: true,
};
const page = (dates: string[], earlierDate: string | null, name = 'Карта'): AccountOperations => ({
  account: { ...ACCOUNT, name },
  days: dates.map((date) => ({ date, operations: [] })),
  earlierDate,
});

describe('account operations read in windows (FT-118)', () => {
  it('the first window is the last 60 days with today, and anything later', () => {
    expect(OPERATIONS_WINDOW_DAYS).toBe(60);
    expect(firstOperationsWindow('2026-10-20')).toEqual({ from: '2026-08-22', to: null });
  });

  it('the next window ends on the newest earlier day the server named; none when nothing is earlier', () => {
    expect(nextOperationsWindow({ earlierDate: '2026-06-03' })).toEqual({ from: '2026-04-05', to: '2026-06-03' });
    expect(nextOperationsWindow({ earlierDate: null })).toBeNull();
    expect(nextOperationsWindow({})).toBeNull();
  });

  it('joins the windows newest first, with the account of the newest read', () => {
    const merged = mergeOperationWindows([page(['2026-10-20', '2026-09-01'], '2026-06-03'), page(['2026-06-03'], null, 'Старое имя')]);
    expect(merged.account.name).toBe('Карта');
    expect(merged.days.map((day) => day.date)).toEqual(['2026-10-20', '2026-09-01', '2026-06-03']);
    expect(merged.earlierDate).toBeNull();
  });
});
