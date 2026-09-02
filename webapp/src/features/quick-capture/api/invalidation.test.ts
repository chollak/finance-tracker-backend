import { describe, it, expect } from 'vitest';

import { quickCaptureInvalidationKeys } from './invalidation';
import type { QuickCaptureResult } from '../model/types';
import { transactionKeys } from '@/entities/transaction/api/keys';
import { budgetKeys } from '@/entities/budget/api/keys';
import { dashboardKeys } from '@/entities/dashboard/api/keys';
import { subscriptionKeys } from '@/entities/subscription/api/keys';
import { debtKeys } from '@/entities/debt/api/keys';

// Quick capture persists on the server, so the Mini App has to refetch the same caches the
// local create/update/delete mutations invalidate — otherwise Home keeps showing stale totals.
// A `no_transaction` result wrote nothing and must not trigger any refetch.
function result(overrides: Partial<QuickCaptureResult> = {}): QuickCaptureResult {
  return {
    status: 'saved',
    text: 'такси 18к',
    source: 'miniapp',
    transactions: [
      {
        id: 'tx-1',
        amount: 18000,
        type: 'expense',
        semanticType: 'expense',
        category: 'transport',
        date: '2026-09-02',
        needsReview: false,
        countsAsRealExpense: true,
      },
    ],
    debts: [],
    ack: { title: 'Записал', summary: 'Такси · 18 000 сум', actions: ['edit', 'delete'] },
    review: { reasons: [] },
    ...overrides,
  };
}

describe('quickCaptureInvalidationKeys', () => {
  it('refreshes the transaction list and every total derived from it', () => {
    const keys = quickCaptureInvalidationKeys(result(), 'user-1');

    expect(keys).toContainEqual(transactionKeys.list('user-1'));
    expect(keys).toContainEqual(budgetKeys.summaries('user-1'));
    expect(keys).toContainEqual(dashboardKeys.insights('user-1'));
    expect(keys).toContainEqual(dashboardKeys.quickStats('user-1'));
    expect(keys).toContainEqual(transactionKeys.analytics('user-1'));
    expect(keys).toContainEqual(transactionKeys.categorySummary('user-1'));
    expect(keys).toContainEqual(transactionKeys.trends('user-1'));
    expect(keys).toContainEqual(subscriptionKeys.status('user-1'));
  });

  it('leaves debt caches alone when no debt was captured', () => {
    const keys = quickCaptureInvalidationKeys(result(), 'user-1');

    expect(keys).not.toContainEqual(debtKeys.lists());
    expect(keys).not.toContainEqual(debtKeys.summary('user-1'));
  });

  it('refreshes debt caches when the capture created a debt', () => {
    const keys = quickCaptureInvalidationKeys(
      result({
        status: 'needs_review',
        transactions: [],
        debts: [{ id: 'debt-1', debtType: 'i_owe', personName: 'Алишер', amount: 200000 }],
        ack: { title: 'Записал долг', summary: 'Алишер · 200 000 сум', actions: ['review'] },
        review: { reasons: ['debt_detected'] },
      }),
      'user-1'
    );

    expect(keys).toContainEqual(debtKeys.lists());
    expect(keys).toContainEqual(debtKeys.summary('user-1'));
    // A debt-only capture still changed nothing in the transaction list, but the pipeline can
    // link a transaction to a debt, so the list is refreshed too.
    expect(keys).toContainEqual(transactionKeys.list('user-1'));
  });

  it('invalidates nothing when nothing was recognized', () => {
    const keys = quickCaptureInvalidationKeys(
      result({
        status: 'no_transaction',
        text: 'привет',
        transactions: [],
        debts: [],
        ack: { title: 'Не нашёл операцию', summary: 'Не удалось распознать сумму или операцию', actions: [] },
      }),
      'user-1'
    );

    expect(keys).toEqual([]);
  });
});
