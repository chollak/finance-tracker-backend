import { Outlet, ScrollRestoration } from 'react-router-dom';
import { useTelegramBackButton } from '@/shared/lib/navigation';

/**
 * The frame around every app screen (FT-110). There is no bottom bar and no top navigation: Home is the
 * top of the app, History and Analytics open from it, the other sections from «Ещё». Nested screens get
 * Telegram's BackButton (kept in step here) or, outside Telegram, their own «Назад».
 * The shell owns the `<main>` landmark, so pages render `PageShell` as a plain `div`. With no bottom bar
 * it keeps the system zone (`viewport-fit=cover`: the home indicator outside Telegram) clear below every
 * screen; `space-6` above it comes from `PageShell`.
 */
export function AppShell() {
  useTelegramBackButton();

  return (
    <main className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)]">
      <ScrollRestoration />
      <Outlet />
    </main>
  );
}
