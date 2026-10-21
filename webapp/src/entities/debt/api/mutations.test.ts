import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationObserver, QueryClient, type QueryKey } from '@tanstack/react-query';
import { accountKeys } from '@/entities/account';
import { transactionKeys } from '@/entities/transaction';
import { createDebtMutation, linkedRecordKeys, payDebtFullMutation, payDebtMutation } from './mutations';

/**
 * FT-111 review: a debt written with its money moving puts a linked record on an account, so after it
 * Home must not keep the old balance, month totals and recent records. Each writer runs on its own client
 * with the server answered here; what it refreshes is read back from the cache.
 */

vi.mock('@/shared/api', () => ({
  apiClient: { post: vi.fn(async () => ({ success: true, data: {} })) },
}));
vi.mock('@/shared/lib/haptic', () => ({ haptic: { success: vi.fn(), warning: vi.fn() } }));

const ME = '900000001';
const SOMEONE_ELSE = '900000002';
const OCTOBER = { from: '2026-10-01', to: '2026-10-31' };

/** What Home and History read for a user. */
function homeReads(userId: string): QueryKey[] {
  return [
    accountKeys.list(userId),
    transactionKeys.totals(userId, OCTOBER),
    transactionKeys.recent(userId, 5),
    transactionKeys.list(userId),
  ];
}

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient();
  for (const key of [...homeReads(ME), ...homeReads(SOMEONE_ELSE)]) client.setQueryData(key, {});
});

const stale = (userId: string) => homeReads(userId).map((key) => client.getQueryState(key)?.isInvalidated);

describe('a debt that moves money refreshes Home', () => {
  it('a debt created with the money handed over', async () => {
    await new MutationObserver(client, createDebtMutation(client, ME)).mutate({
      type: 'owed_to_me',
      personName: 'Алишер',
      amount: 200_000,
      moneyTransferred: true,
    });

    expect(stale(ME)).toEqual([true, true, true, true]);
    expect(stale(SOMEONE_ELSE)).toEqual([false, false, false, false]);
  });

  it('a payment', async () => {
    await new MutationObserver(client, payDebtMutation(client, ME)).mutate({ debtId: 'd1', data: { amount: 50_000 } });

    expect(stale(ME)).toEqual([true, true, true, true]);
    expect(stale(SOMEONE_ELSE)).toEqual([false, false, false, false]);
  });

  it('«Погасить полностью»', async () => {
    await new MutationObserver(client, payDebtFullMutation(client, ME)).mutate({ debtId: 'd1' });

    expect(stale(ME)).toEqual([true, true, true, true]);
    expect(stale(SOMEONE_ELSE)).toEqual([false, false, false, false]);
  });
});

describe('a debt that writes no record leaves Home alone', () => {
  it('a debt created without handing over money', async () => {
    await new MutationObserver(client, createDebtMutation(client, ME)).mutate({
      type: 'i_owe',
      personName: 'Алишер',
      amount: 200_000,
    });

    expect(stale(ME)).toEqual([false, false, false, false]);
  });

  it('payments asked to write no record', async () => {
    await new MutationObserver(client, payDebtMutation(client, ME)).mutate({
      debtId: 'd1',
      data: { amount: 50_000, createTransaction: false },
    });
    await new MutationObserver(client, payDebtFullMutation(client, ME)).mutate({ debtId: 'd1', createTransaction: false });

    expect(stale(ME)).toEqual([false, false, false, false]);
  });
});

it('the linked record keys are Home’s balance readers and the record list of that user', () => {
  expect(linkedRecordKeys(ME)).toEqual(
    expect.arrayContaining([accountKeys.list(ME), transactionKeys.totals(ME), transactionKeys.recent(ME), transactionKeys.list(ME)])
  );
});
