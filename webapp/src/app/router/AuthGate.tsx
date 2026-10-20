import { lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useUserStore } from '@/entities/user';
import { Loading } from '@/shared/ui/loading';
import { authDecision } from './authDecision';
import { AppLoading } from './AppLoading';

const LoginPage = lazy(() => import('@/pages').then((m) => ({ default: m.LoginPage })));

/**
 * Every app screen needs a signed-in Telegram account (FT-128, decision Д4): the Mini App's, or in a browser the
 * session the bot confirmed. Without one the login screen shows at the address that was opened, and that address goes
 * on to the app once the login is confirmed. The /dev pages stay outside.
 */
export function AuthGate() {
  const { pathname } = useLocation();
  const decision = useUserStore((state) => authDecision({ userId: state.userId, signedOut: state.signedOut }));

  if (decision === 'wait') return <AppLoading pathname={pathname} />;
  if (decision === 'login') {
    return (
      <Suspense fallback={<Loading fullScreen />}>
        <LoginPage />
      </Suspense>
    );
  }
  return <Outlet />;
}
