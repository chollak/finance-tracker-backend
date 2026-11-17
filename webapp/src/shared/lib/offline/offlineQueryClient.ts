import { QueryClient, onlineManager } from '@tanstack/react-query';
import { isNoConnectionError } from './connectivity';

/** How many times a failed read is tried again. */
const READ_RETRIES = 1;

/**
 * Without a connection there is nothing to try again on: with `offlineFirst` a retry would wait for the connection,
 * and the screen would stay on its skeleton.
 */
function retryRead(failureCount: number, error: unknown): boolean {
  if (isNoConnectionError(error) && !onlineManager.isOnline()) return false;
  return failureCount < READ_RETRIES;
}

/**
 * The app's query client. What it adds to TanStack Query is how a read behaves without a connection (#322):
 * - a read that has something to show — kept on the device for the offline mode (FT-129) or read earlier — waits for
 *   the connection (`online`): the screen keeps what it has, nothing fails;
 * - a read with nothing to show is asked anyway (`offlineFirst`) and fails as «no answer», so its screen says «Не
 *   удалось загрузить» with «Попробовать снова» instead of a skeleton that never ends. It is read again by itself when
 *   the connection is back.
 * The mode is chosen each time a read's options are prepared, by whether the read has data then. A read that names its
 * own `networkMode` keeps it.
 */
class OfflineQueryClient extends QueryClient {
  override defaultQueryOptions: QueryClient['defaultQueryOptions'] = (options) => {
    const prepared = QueryClient.prototype.defaultQueryOptions.call(this, options as never);
    // Prepared before (the observer passes its options back): the mode stays as chosen then
    if ((options as { _defaulted?: boolean })._defaulted || prepared.networkMode) return prepared as never;
    const hasData = this.getQueryCache().get(prepared.queryHash)?.state.data !== undefined;
    prepared.networkMode = hasData ? 'online' : 'offlineFirst';
    return prepared as never;
  };
}

export function createOfflineQueryClient(): QueryClient {
  return new OfflineQueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 10, // 10 minutes
        retry: retryRead,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
