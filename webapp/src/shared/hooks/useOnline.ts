import { useIsOffline } from '@/shared/lib/offline';

/**
 * Whether the app has a connection (FT-129): the device's, and the server answers. The accounts screen names the last
 * known rate without one (RateRow.md).
 */
export function useIsOnline(): boolean {
  return !useIsOffline();
}
