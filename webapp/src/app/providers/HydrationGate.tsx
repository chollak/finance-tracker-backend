import type { ReactNode } from 'react';
import { useHasHydrated } from '@/entities/user/model/store';
import { AppLoading } from '../router/AppLoading';

interface HydrationGateProps {
  children: ReactNode;
}

/**
 * Waits for Zustand store to hydrate from localStorage before rendering children.
 * This prevents flicker caused by components reading stale initial state.
 */
export function HydrationGate({ children }: HydrationGateProps) {
  const hasHydrated = useHasHydrated();

  if (!hasHydrated) {
    // Very fast (< 50ms), but on Home it is already Home's skeleton (FT-112). Above the router, so the
    // address is read from the page
    return <AppLoading pathname={typeof window === 'undefined' ? '' : window.location.pathname} />;
  }

  return <>{children}</>;
}
