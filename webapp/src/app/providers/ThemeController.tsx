import { useEffect } from 'react';
import { pastelColors } from '@/shared/config/pastelTokens';
import { resolveTheme, useThemeStore, type ResolvedTheme } from '@/shared/lib/theme';

/**
 * Telegram's SDK reports colorScheme 'light' even in a plain browser, so it counts only when the page
 * really runs inside Telegram (initData is present); otherwise the system setting decides.
 */
function telegramScheme(): ResolvedTheme | null {
  const telegram = window.Telegram?.WebApp;
  if (!telegram?.initData) return null;
  const scheme = telegram.colorScheme;
  return scheme === 'dark' || scheme === 'light' ? scheme : null;
}

function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'dark');

  const background = pastelColors[theme].bg;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);

  // The screen lives under Telegram's header: paint it with the same background.
  const telegram = window.Telegram?.WebApp;
  try {
    telegram?.setHeaderColor?.(background);
    telegram?.setBackgroundColor?.(background);
  } catch {
    // older Telegram clients reject custom colours — the page still renders correctly
  }
}

/**
 * Applies the theme of «Пастель» to <html data-theme> and keeps it in sync with the user's choice,
 * Telegram's colorScheme (event `themeChanged`) and, outside Telegram, the system setting.
 * index.html sets the first value before React loads, so there is no flash on open.
 */
export function ThemeController() {
  const preference = useThemeStore((state) => state.preference);
  const setResolved = useThemeStore((state) => state.setResolved);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => {
      const theme = resolveTheme(preference, telegramScheme(), Boolean(media?.matches));
      applyTheme(theme);
      setResolved(theme);
    };

    update();
    const telegram = window.Telegram?.WebApp;
    telegram?.onEvent?.('themeChanged', update);
    media?.addEventListener?.('change', update);
    return () => {
      telegram?.offEvent?.('themeChanged', update);
      media?.removeEventListener?.('change', update);
    };
  }, [preference, setResolved]);

  return null;
}
