import { useAccounts } from '@/entities/account';
import { useCategories } from '@/entities/category';
import { usePeriodTotals, useRecentRecords } from '@/entities/transaction';
import { useIsGuest } from '@/entities/user';
import { monthBounds, toLocalDate } from '@/shared/lib/dates';
import { RECENT_LIMIT } from '@/widgets/recent-transactions';

/** What the decision needs of a read (a TanStack Query result). */
export interface HomeRead {
  /** The read runs for this user (guests have no server balances or totals). */
  isEnabled: boolean;
  /** No answer yet: neither data nor a failure. */
  isPending: boolean;
}

/**
 * Whether Home is still its skeleton (FT-112): until each of its first reads has answered — with data, or
 * with a failure its section reports with «Попробовать снова» — so Home does not appear piece by piece.
 * Guests read their records on the device at once, and the skeleton's slow message promises records kept
 * on the server, so guests never get it.
 */
export function isHomeLoading({ isGuest, reads }: { isGuest: boolean; reads: readonly HomeRead[] }): boolean {
  return !isGuest && reads.some((read) => read.isEnabled && read.isPending);
}

/**
 * Home's first reads, the same queries its sections make: the balances (balance card), the month's totals
 * (the line under the balance and the tiles), the recent records and the categories they are shown with.
 */
export function useHomeLoading(): boolean {
  const isGuest = useIsGuest();
  const accounts = useAccounts();
  const totals = usePeriodTotals(monthBounds(toLocalDate(new Date())));
  const records = useRecentRecords(RECENT_LIMIT);
  const categories = useCategories();

  return isHomeLoading({ isGuest, reads: [accounts, totals, records, categories] });
}
