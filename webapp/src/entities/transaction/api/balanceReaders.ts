import type { QueryKey } from '@tanstack/react-query';
import { accountKeys } from '@/entities/account/api/keys';
import { transactionKeys } from './keys';

/**
 * What Home reads that every written, changed or deleted record moves (FT-111): the account balances and
 * their total, the month's totals and the recent records. Every writer refetches them after a change —
 * the server computes them, so nothing can be patched into the cache.
 */
export function balanceReaderKeys(userId: string): QueryKey[] {
  return [accountKeys.list(userId), transactionKeys.totals(userId), transactionKeys.recent(userId)];
}
