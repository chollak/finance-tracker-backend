import type { ResolvedTheme, ThemePreference } from '@/shared/lib/theme';

/**
 * «Тема» of «Ещё» (FT-125, boards «Тема», «„Ещё“ в браузере»; design-system «Telegram»): automatic, always light or
 * always dark. Automatic follows Telegram's light or dark inside Telegram and the system setting by a direct link,
 * and is named after it.
 */

export interface ThemeOption {
  value: ThemePreference;
  title: string;
  /** What the choice gives: «Сейчас в Telegram светлая», «Всегда тёмная». */
  subtitle: string;
}

const NAMES: Record<Exclude<ThemePreference, 'telegram'>, string> = { light: 'Светлая', dark: 'Тёмная' };
const NOW: Record<ResolvedTheme, string> = { light: 'светлая', dark: 'тёмная' };

/** The row's state: «Как в Telegram» (in a browser «Как в системе»), «Светлая», «Тёмная». */
export function themeLabel(preference: ThemePreference, inTelegram: boolean): string {
  if (preference === 'telegram') return inTelegram ? 'Как в Telegram' : 'Как в системе';
  return NAMES[preference];
}

/** The three choices of the sheet; `auto` is what the automatic one gives right now. */
export function themeOptions(inTelegram: boolean, auto: ResolvedTheme): ThemeOption[] {
  return [
    { value: 'telegram', title: themeLabel('telegram', inTelegram), subtitle: `${inTelegram ? 'Сейчас в Telegram' : 'Сейчас'} ${NOW[auto]}` },
    { value: 'light', title: NAMES.light, subtitle: 'Всегда светлая' },
    { value: 'dark', title: NAMES.dark, subtitle: 'Всегда тёмная' },
  ];
}

export const THEME_SAVE_FAILED = { title: 'Не получилось сохранить тему', detail: 'Проверьте связь и попробуйте ещё раз' } as const;
