import type { ReactNode } from 'react';
import { useHasHydrated } from '@/entities/user/model/store';
import { Loading } from '@/shared/ui/loading';

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
    // Show minimal loading state while hydrating
    // This is very fast (< 50ms) so users won't notice
    return <Loading fullScreen />;
  }

  return <>{children}</>;
}
