import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { flushRecordOutbox } from '@/entities/transaction';
import { serverAnswers } from '@/shared/api';
import {
  connectionReached,
  loadOutbox,
  offlineOf,
  outboxOf,
  restoreSavedReads,
  useConnectivityStore,
  watchBrowserConnection,
  type ConnectivityState,
} from '@/shared/lib/offline';

/** How often waiting records are sent again, or the server asked whether it is back (FT-129). */
export const OFFLINE_SYNC_INTERVAL_MS = 15_000;

export interface OfflineSyncDeps {
  queryClient: QueryClient;
  userId: string;
  /** Sends the outbox; the records' outbox by default. */
  flush?: (queryClient: QueryClient, userId: string) => Promise<unknown>;
  /** Whether the server answers at all; `GET /api/health` by default. */
  probe?: () => Promise<boolean>;
  intervalMs?: number;
}

/** Reads that failed, or stand on what was kept on the device, are read again once the server is back. */
function refreshAfterReconnect(queryClient: QueryClient): void {
  void queryClient.refetchQueries({ type: 'active', predicate: (query) => query.state.status === 'error' || query.isStale() });
}

/**
 * Keeps the app working without a connection for the signed-in user (FT-129):
 * - TanStack Query follows the browser's connection, also when the app opens offline — reads wait instead of failing;
 * - going offline fills the reads that have nothing from what was kept on the device;
 * - records written without a connection go when it is back: at the start, on the browser's `online`, and every few
 *   seconds while some wait;
 * - while the server is not answering (the device says it is online), it is asked every few seconds whether it is back.
 * Returns the stop.
 */
export function startOfflineSync({
  queryClient,
  userId,
  flush = flushRecordOutbox,
  probe = serverAnswers,
  intervalMs = OFFLINE_SYNC_INTERVAL_MS,
}: OfflineSyncDeps): () => void {
  let stopped = false;
  const stopBrowser = watchBrowserConnection();
  onlineManager.setOnline(useConnectivityStore.getState().browserOnline);

  const send = () => {
    if (!stopped && outboxOf(userId).length > 0) void flush(queryClient, userId);
  };

  let before: ConnectivityState = useConnectivityStore.getState();
  const stopWatching = useConnectivityStore.subscribe((now) => {
    if (now.browserOnline !== before.browserOnline) onlineManager.setOnline(now.browserOnline);
    const wasOffline = offlineOf(before);
    const isOfflineNow = offlineOf(now);
    before = now;
    if (!wasOffline && isOfflineNow) void restoreSavedReads(queryClient, userId);
    if (wasOffline && !isOfflineNow) {
      send();
      refreshAfterReconnect(queryClient);
    }
  });

  // What the device kept from an earlier start goes as soon as there is a connection
  void loadOutbox(userId).then(() => {
    if (!offlineOf(useConnectivityStore.getState())) send();
  });

  const tick = () => {
    const state = useConnectivityStore.getState();
    if (stopped || !state.browserOnline) return;
    if (outboxOf(userId).length > 0) {
      send();
      return;
    }
    if (state.lost) {
      void probe().then((answers) => {
        if (answers && !stopped) connectionReached();
      });
    }
  };
  const timer = setInterval(tick, intervalMs);
  const onVisible = () => {
    if (document.visibilityState === 'visible') tick();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    stopWatching();
    stopBrowser();
  };
}
