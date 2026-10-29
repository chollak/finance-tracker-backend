import type { QueryKey } from '@tanstack/react-query';

import { balanceReaderKeys, transactionKeys } from '@/entities/transaction';
import { budgetKeys } from '@/entities/budget/api/keys';
import { subscriptionKeys } from '@/entities/subscription/api/keys';
import { debtKeys } from '@/entities/debt/api/keys';

import { toCaptureFeedback } from '../model/toCaptureFeedback';
import type { QuickCaptureResult } from '../model/types';

/**
 * What shows the records a capture writes. Also refetched when a send was given up (FT-146): the server may have written
 * them all the same, and Home's «Последние операции» should show them.
 */
export function capturedRecordKeys(userId: string): QueryKey[] {
  return [
    transactionKeys.list(userId),
    budgetKeys.summaries(userId),
    subscriptionKeys.status(userId),
    // Home: the balances, the month tiles and the recent records (FT-111); History; Analytics (FT-121)
    ...balanceReaderKeys(userId),
  ];
}

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

  const keys = capturedRecordKeys(userId);

  if (result.debts.length > 0) {
    keys.push(debtKeys.lists(), debtKeys.summary(userId));
  }

  return keys;
}
