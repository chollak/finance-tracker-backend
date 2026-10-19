import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { accountKeys } from '@/entities/account';
import { balanceReaderKeys } from './balanceReaders';
import { transactionKeys } from './keys';

describe('what a change of records refreshes on Home (FT-111)', () => {
  it('the balances, every month total and every recent list of that user — and nobody else’s', async () => {
    const client = new QueryClient();
    const october = { from: '2026-10-01', to: '2026-10-31' };
    const mine = [accountKeys.list('user-1'), transactionKeys.totals('user-1', october), transactionKeys.recent('user-1', 5)];
    const theirs = [accountKeys.list('user-2'), transactionKeys.totals('user-2', october), transactionKeys.recent('user-2', 5)];
    for (const key of [...mine, ...theirs]) client.setQueryData(key, {});

    for (const queryKey of balanceReaderKeys('user-1')) await client.invalidateQueries({ queryKey });

    expect(mine.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([true, true, true]);
    expect(theirs.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([false, false, false]);
  });
});
