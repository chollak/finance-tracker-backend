import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { connectionLost } from './connectivity';
import { offlineStorage } from './storage';

/**
 * The reads kept for the offline mode (FT-129): Home and the accounts open without a connection from what the server
 * answered last time. Which reads, and whose, the app decides (`userOf`); everything else stays in memory only.
 */
export interface SavedReadPolicy {
  /** The user a read belongs to when it is kept; null when it is not kept. */
  userOf: (queryKey: QueryKey) => string | null;
}

/**
 * Keeps every answer of a read the policy names, as it comes from the server. Data put in by hand (`setQueryData`:
 * a restored read, an optimistic change) is not an answer and is not kept. Returns the stop.
 */
export function persistReads(queryClient: QueryClient, { userOf }: SavedReadPolicy): () => void {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success' || event.action.manual) return;
    const { query } = event;
    const userId = userOf(query.queryKey);
    if (!userId || query.state.data === undefined) return;
    void offlineStorage()
      .putRead({
        hash: query.queryHash,
        userId,
        queryKey: [...query.queryKey],
        data: query.state.data,
        updatedAt: query.state.dataUpdatedAt,
      })
      .catch(() => undefined);
  });
}

/**
 * Fills the reads of this user that have nothing yet with what was kept, with the time it was read — so they count as
 * old and are read again as soon as the server answers. What this session has read is never replaced.
 */
export async function restoreSavedReads(queryClient: QueryClient, userId: string): Promise<number> {
  let rows;
  try {
    rows = await offlineStorage().listReads(userId);
  } catch {
    return 0;
  }
  let restored = 0;
  for (const row of rows) {
    if (queryClient.getQueryData(row.queryKey) !== undefined) continue;
    queryClient.setQueryData(row.queryKey, row.data, { updatedAt: row.updatedAt });
    restored += 1;
  }
  return restored;
}

/** «Выйти» or a lost session: nothing is left for the next account in this browser. */
export async function forgetSavedReads(): Promise<void> {
  try {
    await offlineStorage().clearReads();
  } catch {
    // Storage blocked: nothing kept to forget
  }
}

/**
 * «Записывать без связи» under a loading that takes too long (FT-112): the screens open on what was kept and the
 * app works offline until the server answers again.
 */
export async function workOffline(queryClient: QueryClient, userId: string | null): Promise<void> {
  if (userId) await restoreSavedReads(queryClient, userId);
  connectionLost();
}
