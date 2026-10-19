import { lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useUserStore } from '@/entities/user';
import { useSettings } from '@/entities/settings';
import { Loading } from '@/shared/ui/loading';
import { firstLaunchDecision } from './firstLaunchDecision';
import { AppLoading } from './AppLoading';

const FirstLaunchPage = lazy(() => import('@/pages').then((m) => ({ default: m.FirstLaunchPage })));

/**
 * Every screen of the app sits behind the first launch (FT-109): until the user has said how much money
 * they have now, the account total is meaningless (a migrated «Карта» carries all the history and a zero
 * opening balance). The /dev pages stay outside, so the device checks run without it. While it waits, Home
 * opens on its skeleton (FT-112).
 */
export function FirstLaunchGate() {
  const { pathname } = useLocation();
  const userType = useUserStore((state) => state.userType);
  const settings = useSettings();
  const decision = firstLaunchDecision({
    userType,
    settings: { isPending: settings.isPending, isError: settings.isError, data: settings.data },
  });

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
