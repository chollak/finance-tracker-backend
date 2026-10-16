/**
 * Theme of «Пастель» (FT-092): «как в Telegram», светлая или тёмная.
 * The design system picks light or dark from Telegram's `colorScheme`, not Telegram's colours one to one.
 */
export type ThemePreference = 'telegram' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['telegram', 'light', 'dark'];
export const THEME_STORAGE_KEY = 'daftar-theme';

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/**
 * `telegram` follows Telegram's colorScheme; outside Telegram it follows the system setting.
 * An explicit choice wins everywhere.
 */
export function resolveTheme(
  preference: ThemePreference,
  telegramScheme: ResolvedTheme | null | undefined,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  if (telegramScheme === 'light' || telegramScheme === 'dark') return telegramScheme;
  return systemPrefersDark ? 'dark' : 'light';
}
