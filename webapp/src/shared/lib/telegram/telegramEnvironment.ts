/**
 * Where the app runs: inside Telegram (a Mini App) or by a direct link in a browser. Telegram's SDK is loaded in a
 * plain browser too, with empty initData, so only initData tells them apart (design-system «Telegram»).
 */

function telegramWebApp() {
  return typeof window === 'undefined' ? undefined : window.Telegram?.WebApp;
}

/** The page runs inside Telegram: «Ещё» has no «Аккаунт», the theme follows Telegram (FT-125). */
export function insideTelegram(): boolean {
  return Boolean(telegramWebApp()?.initData);
}

/** Telegram's light or dark, only when the page really runs inside Telegram; null elsewhere. */
export function telegramColorScheme(): 'light' | 'dark' | null {
  const telegram = telegramWebApp();
  if (!telegram?.initData) return null;
  const scheme = telegram.colorScheme;
  return scheme === 'dark' || scheme === 'light' ? scheme : null;
}
