import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

const online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

/**
 * Whether the device has a connection (the browser's `online`/`offline`). The accounts screen names the last known
 * rate without one (RateRow.md); the offline queue and its bar come with FT-129.
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, online, () => true);
}
