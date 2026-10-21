import { useAccounts } from '@/entities/account';
import { useCategories } from '@/entities/category';
import { useUsdRate } from '@/entities/rate';
import { usePeriodTotals, useRecentRecords } from '@/entities/transaction';
import { monthBounds, toLocalDate } from '@/shared/lib/dates';
import { useIsOffline } from '@/shared/lib/offline';
import { RECENT_LIMIT } from '@/widgets/recent-transactions';

/** What the decision needs of a read (a TanStack Query result). */
export interface HomeRead {
  /** The read runs for this user. */
  isEnabled: boolean;
  /**
   * No data: on its way for the first time, or asked again after a failure (a failed read with no data is
   * pending again while it is asked again).
   */
  isPending: boolean;
  /** It has answered at least once, with data or with a failure; stays so while it is asked again. */
  isFetched: boolean;
}

/**
 * Whether Home is still its skeleton (FT-112): until each of its first reads has answered once — with data,
 * or with a failure its section reports with «Попробовать снова» — so Home does not appear piece by piece.
 *
 * Answered once is enough: a failed read with no data is pending again as soon as Home's sections mount and
 * TanStack asks it again (retryOnMount). Waiting for that answer too would swap Home back to the skeleton,
 * unmount the sections and ask again without end, and the section's error would never show.
 */
export function isHomeLoading({ reads, offline = false }: { reads: readonly HomeRead[]; offline?: boolean }): boolean {
  // Without a connection (FT-129) a read that has nothing cannot answer: Home opens on what it has (the reads kept on
  // the device fill it) with the offline line, and writing works
  if (offline) return false;
  return reads.some((read) => read.isEnabled && read.isPending && !read.isFetched);
}

/**
 * Home's first reads, the same queries its sections make: the balances (balance card), the month's totals
 * (the line under the balance and the tiles), the recent records and the categories they are shown with,
 * and the USD rate — the card and the tiles are in dollars when «Сум / USD» says so (FT-137), so Home does
 * not open in сум and turn into dollars a moment later. The settings with that choice are read before Home
 * (the first-launch gate).
 */
export function useHomeLoading(): boolean {
  const accounts = useAccounts();
  const totals = usePeriodTotals(monthBounds(toLocalDate(new Date())));
  const records = useRecentRecords(RECENT_LIMIT);
  const categories = useCategories();
  const rate = useUsdRate();
  const offline = useIsOffline();

  return isHomeLoading({ reads: [accounts, totals, records, categories, rate], offline });
}
