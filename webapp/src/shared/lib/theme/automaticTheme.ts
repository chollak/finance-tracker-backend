import { telegramColorScheme } from '@/shared/lib/telegram';
import { resolveTheme, type ResolvedTheme } from './resolveTheme';

/** The system asks for dark (outside Telegram the automatic theme follows it). */
export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

/** What the automatic theme gives right now: Telegram's light or dark inside Telegram, the system's elsewhere. */
export function automaticTheme(): ResolvedTheme {
  return resolveTheme('telegram', telegramColorScheme(), systemPrefersDark());
}
