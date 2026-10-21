import { lazy, Suspense, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useUserStore } from '@/entities/user';
import { useSettings } from '@/entities/settings';
import { useIsOffline } from '@/shared/lib/offline';
import { Loading } from '@/shared/ui/loading';
import { firstLaunchDecision } from './firstLaunchDecision';
import { AppLoading } from './AppLoading';

const FirstLaunchPage = lazy(() => import('@/pages').then((m) => ({ default: m.FirstLaunchPage })));

/**
 * Every screen of the app sits behind the first launch (FT-109): until the user has said how much money
 * they have now, the account total is meaningless (a migrated «Карта» carries all the history and a zero
 * opening balance). The /dev pages stay outside, so the device checks run without it. While it waits, Home
 * opens on its skeleton (FT-112). Once it has let a user in, it does not take the app away again while the
 * settings are read anew (see `firstLaunchDecision`).
 */
export function FirstLaunchGate() {
  const { pathname } = useLocation();
  const userType = useUserStore((state) => state.userType);
  const userId = useUserStore((state) => state.userId);
  const settings = useSettings();
  const offline = useIsOffline();
  // The user the gate has let into the app; another user (a sign-in after «Выйти») waits again
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const decision = firstLaunchDecision({
    userType,
    settings: { isPending: settings.isPending, isError: settings.isError, data: settings.data },
    opened: userId !== null && openedFor === userId,
    offline,
  });
  // Remembered during the render (React's «storing information from previous renders»): the next render — the
  // screen's own read making the settings pending again — must already know
  if (decision === 'app' && userId !== null && openedFor !== userId) setOpenedFor(userId);

  if (decision === 'wait') return <AppLoading pathname={pathname} />;
  if (decision === 'first-launch') {
    return (
      <Suspense fallback={<Loading fullScreen />}>
        <FirstLaunchPage />
      </Suspense>
    );
  }
  return <Outlet />;
}
