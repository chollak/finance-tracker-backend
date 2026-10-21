import type { QueryKey } from '@tanstack/react-query';
import { accountKeys } from '@/entities/account';
import { categoryKeys } from '@/entities/category';
import { rateKeys } from '@/entities/rate';
import { settingsKeys } from '@/entities/settings';
import { transactionKeys } from '@/entities/transaction';
import { RECENT_LIMIT } from '@/widgets/recent-transactions';

/**
 * The reads kept on the device for the offline mode (FT-129): what Home, the accounts, the manual entry and the
 * composer need to open without a connection — the balances, the month's totals, the recent records, the frequent
 * expenses of the quick chips, the categories, the USD rate and the settings. History, an account's operations and
 * analytics are not kept.
 */
function keptKeys(userId: string): { exact: QueryKey[]; prefix: QueryKey[] } {
  return {
    exact: [
      accountKeys.list(userId),
      transactionKeys.recent(userId, RECENT_LIMIT),
      transactionKeys.frequent(userId),
      categoryKeys.list(userId),
      rateKeys.usd(userId),
      settingsKeys.detail(userId),
    ],
    // Every month's totals: Home asks the current one
    prefix: [transactionKeys.totals(userId)],
  };
}

const same = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((part, index) => part === b[index]);
const startsWith = (key: readonly unknown[], prefix: readonly unknown[]) => key.length > prefix.length && prefix.every((part, index) => key[index] === part);

/** The user a read belongs to when it is kept on the device; null when it is not kept. */
export function savedReadUser(queryKey: QueryKey): string | null {
  for (const candidate of queryKey) {
    if (typeof candidate !== 'string') continue;
    const { exact, prefix } = keptKeys(candidate);
    if (exact.some((key) => same(queryKey, key)) || prefix.some((key) => startsWith(queryKey, key))) return candidate;
  }
  return null;
}
