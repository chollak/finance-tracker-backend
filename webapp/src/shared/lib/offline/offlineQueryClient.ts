import { QueryClient, onlineManager } from '@tanstack/react-query';
import { isNoConnectionError } from './connectivity';

/** How many times a failed read is tried again, unless the read says otherwise. */
const READ_RETRIES = 1;

/** TanStack Query's own number of retries, for a read prepared with no `retry` at all. */
const LIBRARY_RETRIES = 3;

type Retry = boolean | number | ((failureCount: number, error: never) => boolean) | undefined;

/** What the read's own `retry` says: a rule, a number of retries, or yes/no. */
function retryBy(retry: Retry, failureCount: number, error: unknown): boolean {
  if (typeof retry === 'function') return retry(failureCount, error as never);
  if (typeof retry === 'boolean') return retry;
  return failureCount < (retry ?? LIBRARY_RETRIES);
}

/**
 * The read's own retry rule, except that without a connection «no answer» is never tried again: there is nothing to
 * try on, and with `offlineFirst` a retry would wait for the connection — the screen would stay on its skeleton.
 * Wrapped around whatever the read names (the account screen and a category of analytics have rules of their own),
 * so no read can opt out by naming a `retry`.
 */
function retryUnlessOffline(retry: Retry) {
  return (failureCount: number, error: unknown): boolean => {
    if (isNoConnectionError(error) && !onlineManager.isOnline()) return false;
    return retryBy(retry, failureCount, error);
  };
}

/**
 * The app's query client. What it adds to TanStack Query is how a read behaves without a connection (#322):
 * - a read that has something to show — kept on the device for the offline mode (FT-129) or read earlier — waits for
 *   the connection (`online`): the screen keeps what it has, nothing fails, and its retries wait too;
 * - a read with nothing to show is asked anyway (`offlineFirst`) and fails as «no answer», so its screen says «Не
 *   удалось загрузить» with «Попробовать снова» instead of a skeleton that never ends. It is not tried again while
 *   there is no connection, whatever `retry` the read names, and is read again by itself when the connection is back.
 * The mode is chosen each time a read's options are prepared, by whether the read has data then. A read that names its
 * own `networkMode` keeps it, and its `retry` as it is.
 */
class OfflineQueryClient extends QueryClient {
  override defaultQueryOptions: QueryClient['defaultQueryOptions'] = (options) => {
    const prepared = QueryClient.prototype.defaultQueryOptions.call(this, options as never);
    // Prepared before (the observer passes its options back): the mode stays as chosen then
    if ((options as { _defaulted?: boolean })._defaulted || prepared.networkMode) return prepared as never;
    const hasData = this.getQueryCache().get(prepared.queryHash)?.state.data !== undefined;
    prepared.networkMode = hasData ? 'online' : 'offlineFirst';
    if (!hasData) prepared.retry = retryUnlessOffline(prepared.retry as Retry);
    return prepared as never;
  };
}

export function createOfflineQueryClient(): QueryClient {
  return new OfflineQueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 10, // 10 minutes
        retry: READ_RETRIES,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
