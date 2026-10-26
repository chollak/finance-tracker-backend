import type { QueryKey } from '@tanstack/react-query';
import { accountKeys } from '@/entities/account';
import { analyticsKeys } from '@/entities/analytics';
import { auditKeys } from '@/entities/audit';
import { transactionKeys } from './keys';

/**
 * What Home and History read that every written, changed or deleted record moves (FT-111): the account balances
 * and their total, the month's totals, the recent records, the frequent expenses of the quick chips (FT-114),
 * History with whatever it is narrowed by (FT-116), every month and category of Analytics (FT-121), and the audit and its
 * goals (FT-132: an audit nobody has marked yet is found again from the records, a goal counts what is spent). Every writer
 * refetches them after a change — the server computes them, so nothing can be patched into the cache.
 */
export function balanceReaderKeys(userId: string): QueryKey[] {
  return [
    accountKeys.list(userId),
    transactionKeys.totals(userId),
    transactionKeys.recent(userId),
    transactionKeys.frequent(userId),
    transactionKeys.history(userId),
    analyticsKeys.all(userId),
    auditKeys.all(userId),
  ];
}
