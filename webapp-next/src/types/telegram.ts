/**
 * Только то, что приложение реально вызывает.
 *
 * В старом фронте этот файл занимал 181 строку и описывал MainButton, BackButton,
 * CloudStorage, themeParams и safeAreaInset — ни одно из этого не вызывалось
 * нигде в коде. MainButton и BackButton вернутся сюда, когда их начнут
 * использовать (задачи 8-9), а не заранее.
 */

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramHapticFeedback {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  selectionChanged(): void;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramUser };
  colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
  HapticFeedback?: TelegramHapticFeedback;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export {};
