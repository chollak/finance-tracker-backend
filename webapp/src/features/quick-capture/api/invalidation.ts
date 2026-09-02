import type { QueryKey } from '@tanstack/react-query';

import { transactionKeys } from '@/entities/transaction/api/keys';
import { budgetKeys } from '@/entities/budget/api/keys';
import { dashboardKeys } from '@/entities/dashboard/api/keys';
import { subscriptionKeys } from '@/entities/subscription/api/keys';
import { debtKeys } from '@/entities/debt/api/keys';

import { toCaptureFeedback } from '../model/toCaptureFeedback';
import type { QuickCaptureResult } from '../model/types';

/**
 * Query keys to invalidate after a capture.
 *
 * Quick capture writes on the server, so — unlike the local create/update mutations — the
 * Mini App cannot patch the cache from the response and has to refetch. Returns an empty
 * list for `no_transaction`: nothing was written, so nothing is stale.
 */
export function quickCaptureInvalidationKeys(
  result: QuickCaptureResult,
  userId: string
): QueryKey[] {
  const { didPersist } = toCaptureFeedback(result);
  if (!didPersist) return [];

  const keys: QueryKey[] = [
    transactionKeys.list(userId),
    transactionKeys.analytics(userId),
    transactionKeys.categorySummary(userId),
    transactionKeys.trends(userId),
    budgetKeys.summaries(userId),
    dashboardKeys.insights(userId),
    dashboardKeys.quickStats(userId),
    subscriptionKeys.status(userId),
  ];

  if (result.debts.length > 0) {
    keys.push(debtKeys.lists(), debtKeys.summary(userId));
  }

  return keys;
}
