import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { accountKeys } from '@/entities/account';
import { analyticsKeys } from '@/entities/analytics';
import { auditKeys } from '@/entities/audit';
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

describe('what a change of records refreshes on Home (FT-114)', () => {
  it('the frequent expenses of the quick chips too: a written or deleted record changes them', async () => {
    const client = new QueryClient();
    client.setQueryData(transactionKeys.frequent('user-1'), []);
    client.setQueryData(transactionKeys.frequent('user-2'), []);

    for (const queryKey of balanceReaderKeys('user-1')) await client.invalidateQueries({ queryKey });

    expect(client.getQueryState(transactionKeys.frequent('user-1'))?.isInvalidated).toBe(true);
    expect(client.getQueryState(transactionKeys.frequent('user-2'))?.isInvalidated).toBe(false);
  });
});

describe('what a change of records refreshes in History (FT-116)', () => {
  it('every search and filter of that user’s History: a deleted or changed record leaves or moves', async () => {
    const client = new QueryClient();
    const searched = transactionKeys.history('user-1', { text: 'такси', categoryId: null, accountId: 'cash', type: null });
    const whole = transactionKeys.history('user-1', { text: '', categoryId: null, accountId: null, type: null });
    const theirs = transactionKeys.history('user-2', { text: '', categoryId: null, accountId: null, type: null });
    for (const key of [searched, whole, theirs]) client.setQueryData(key, {});

    for (const queryKey of balanceReaderKeys('user-1')) await client.invalidateQueries({ queryKey });

    expect([searched, whole, theirs].map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([true, true, false]);
  });
});

describe('what a change of records refreshes in Analytics (FT-121)', () => {
  it('every month, type and category of that user’s analytics: a written, changed or deleted record moves the numbers', async () => {
    const client = new QueryClient();
    const mine = [
      analyticsKeys.month('user-1', undefined, 'expense'),
      analyticsKeys.month('user-1', '2026-09', 'income'),
      analyticsKeys.category('user-1', 'kf', '2026-10'),
    ];
    const theirs = analyticsKeys.month('user-2', undefined, 'expense');
    for (const key of [...mine, theirs]) client.setQueryData(key, {});

    for (const queryKey of balanceReaderKeys('user-1')) await client.invalidateQueries({ queryKey });

    expect(mine.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([true, true, true]);
    expect(client.getQueryState(theirs)?.isInvalidated).toBe(false);
  });
});

describe('what a change of records refreshes for the audit (FT-132)', () => {
  it('the current audit and the goals of that user: an audit not yet marked is found again, a goal counts what is spent', async () => {
    const client = new QueryClient();
    const mine = [auditKeys.current('user-1'), auditKeys.goals('user-1')];
    const theirs = auditKeys.current('user-2');
    for (const key of [...mine, theirs]) client.setQueryData(key, {});

    for (const queryKey of balanceReaderKeys('user-1')) await client.invalidateQueries({ queryKey });

    expect(mine.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([true, true]);
    expect(client.getQueryState(theirs)?.isInvalidated).toBe(false);
  });
});
