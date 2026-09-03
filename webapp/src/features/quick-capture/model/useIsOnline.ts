import { useSyncExternalStore } from 'react';

import { readOnlineStatus } from './toCaptureOfflineNotice';

function subscribe(onStoreChange: () => void) {
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);

  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
}

function getSnapshot() {
  return readOnlineStatus(typeof navigator === 'undefined' ? undefined : navigator);
}

/** Optimistic default: nothing is blocked before the browser has told us it is offline. */
function getServerSnapshot() {
  return true;
}

/**
 * Live `navigator.onLine`, re-read on the `online`/`offline` events.
 *
 * Kept as a thin wrapper on purpose — the decision it feeds (`toCaptureOfflineNotice`) is a
 * plain function, so the copy and the "only an explicit `false` counts" rule stay testable
 * without a DOM.
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
