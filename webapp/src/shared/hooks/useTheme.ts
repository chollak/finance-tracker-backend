import { useThemeStore } from '@/shared/lib/theme';

/**
 * Current theme of «Пастель» and the user's choice (FT-092).
 * The theme itself is applied by ThemeController (app/providers); this hook only reads and sets it.
 */
export function useTheme() {
  const preference = useThemeStore((state) => state.preference);
  const resolvedTheme = useThemeStore((state) => state.resolved);
  const setPreference = useThemeStore((state) => state.setPreference);

  return {
    preference,
    setPreference,
    resolvedTheme,
    isDark: resolvedTheme === 'dark',
  };
}
