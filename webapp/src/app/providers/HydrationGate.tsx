import type { ReactNode } from 'react';
import { useHasHydrated } from '@/entities/user/model/store';
import { AppLoading } from '../router/AppLoading';
import { useSavedReadsAtStart } from './savedReadsAtStart';

interface HydrationGateProps {
  children: ReactNode;
}

/**
 * Waits for Zustand store to hydrate from localStorage before rendering children.
 * This prevents flicker caused by components reading stale initial state. An app that opens without a connection also
 * waits for the reads kept on the device (FT-129), so Home opens on them.
 */
export function HydrationGate({ children }: HydrationGateProps) {
  const hasHydrated = useHasHydrated();
  const readsReady = useSavedReadsAtStart(hasHydrated);

  if (!hasHydrated || !readsReady) {
    // Very fast (< 50ms), but on Home it is already Home's skeleton (FT-112). Above the router, so the
    // address is read from the page
    return <AppLoading pathname={typeof window === 'undefined' ? '' : window.location.pathname} />;
  }

  return <>{children}</>;
}
