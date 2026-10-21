import { create } from 'zustand';

/**
 * Whether the app works without a connection (FT-129, OfflineBar.md). Two things say so:
 * - the device — the browser's `online`/`offline`;
 * - the server stopped answering while the device says it is online: a write got no answer at all, or the user chose
 *   «Записывать без связи» under a loading that takes too long. The next answer of the server (a write, the outbox, the
 *   health check) ends it.
 */
export interface ConnectivityState {
  browserOnline: boolean;
  lost: boolean;
}

const browserSaysOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

export const useConnectivityStore = create<ConnectivityState>()(() => ({ browserOnline: browserSaysOnline(), lost: false }));

export const offlineOf = (state: ConnectivityState): boolean => !state.browserOnline || state.lost;

/** Right now, outside React: a write decides where it goes. */
export function isOffline(): boolean {
  return offlineOf(useConnectivityStore.getState());
}

/** For a screen that looks different without a connection: Home's line, the microphone, the rate row. */
export function useIsOffline(): boolean {
  return useConnectivityStore(offlineOf);
}

/** The server could not be reached (a write got no answer) or the user chose to write without a connection. */
export function connectionLost(): void {
  if (!useConnectivityStore.getState().lost) useConnectivityStore.setState({ lost: true });
}

/** The server answered. */
export function connectionReached(): void {
  if (useConnectivityStore.getState().lost) useConnectivityStore.setState({ lost: false });
}

/** Follows the browser's connection from now on; returns the stop. */
export function watchBrowserConnection(): () => void {
  if (typeof window === 'undefined') return () => {};
  const sync = () => useConnectivityStore.setState({ browserOnline: browserSaysOnline() });
  sync();
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  return () => {
    window.removeEventListener('online', sync);
    window.removeEventListener('offline', sync);
  };
}

/**
 * A request that got no answer at all — no connection, or it timed out (`apiClient` rejects with `statusCode: 0`) —
 * rather than an answer the server gave.
 */
export function isNoConnectionError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { statusCode?: unknown }).statusCode === 0;
}
