import { Suspense, type ReactNode } from 'react';
import { LoadingScreen } from '@/shared/ui/pastel';

/**
 * A screen behind Suspense while its code loads; Home's code loads behind Home's skeleton (FT-112), another screen's
 * behind the theme's background and the Kapelka sign (#290). Its own file, so `appRoutes.tsx` exports no component
 * beside the routes (Fast Refresh, #296).
 */
export function PageLoader({ children, fallback = <LoadingScreen /> }: { children: ReactNode; fallback?: ReactNode }) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}
