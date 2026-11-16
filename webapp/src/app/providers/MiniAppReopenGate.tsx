import type { ReactNode } from 'react';
import { useUserStore } from '@/entities/user';
import { MiniAppReopenPage } from '@/pages/mini-app-reopen';

interface MiniAppReopenGateProps {
  children: ReactNode;
}

/**
 * Inside Telegram, once the server refuses the Mini App's initData (#316), every request would fail: the app gives way
 * to one screen, «Откройте Kapelka заново», whatever was open. Above the router, so no screen of the app shows its own
 * failures behind it. The offline sync stays outside: the outbox keeps its records, and they go after the new opening.
 */
export function MiniAppReopenGate({ children }: MiniAppReopenGateProps) {
  const refused = useUserStore((state) => state.miniAppRefused);
  if (refused) return <MiniAppReopenPage />;
  return <>{children}</>;
}
