import { addDays, type LocalDate } from '@/shared/lib/dates';
import type { AccountOperations } from '../model/types';

/**
 * How far back one read of the account screen goes (FT-118): about two months. A card in daily use has hundreds of
 * operations; the earlier ones are read when the list comes near its end, as History pages.
 */
export const OPERATIONS_WINDOW_DAYS = 60;

/** One read of `GET /api/accounts/:id/operations`: from a day, up to a day (none — up to the newest). */
export interface OperationsWindow {
  from: LocalDate;
  to: LocalDate | null;
}

/** The newest window: the last 60 days with today, and anything dated later. */
export function firstOperationsWindow(today: LocalDate): OperationsWindow {
  return { from: addDays(today, -(OPERATIONS_WINDOW_DAYS - 1)), to: null };
}

/**
 * The window before a page read: it ends on the day of the newest earlier operation, which the server names
 * (`earlierDate`), so it is never empty; null when nothing is earlier.
 */
export function nextOperationsWindow(page: Pick<AccountOperations, 'earlierDate'>): OperationsWindow | null {
  const to = page.earlierDate ?? null;
  return to ? { from: addDays(to, -(OPERATIONS_WINDOW_DAYS - 1)), to } : null;
}

/** The windows read so far as one list: the account as the newest read has it, the days newest first. */
export function mergeOperationWindows(pages: readonly AccountOperations[]): AccountOperations {
  const last = pages[pages.length - 1];
  return {
    account: pages[0].account,
    days: pages.flatMap((page) => page.days),
    earlierDate: last?.earlierDate ?? null,
  };
}
