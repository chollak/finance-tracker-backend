import { env } from '../config/env';

export interface TelegramSession {
  /** Всегда telegramId, никогда UUID. */
  telegramId: string;
  userName: string;
}

/**
 * Открывает сессию мини-аппа.
 *
 * Старый UserInitializer занимал 88 строк и разбирал четыре сценария: Telegram,
 * dev-мок, восстановление сессии из persisted-хранилища и создание гостя
 * с инициализацией IndexedDB. Три последних обслуживали гостевой режим, которого
 * в новом приложении нет: единственный поддерживаемый способ запуска — Telegram.
 *
 * HydrationGate не понадобился вовсе. Он существовал потому, что userId лежал
 * в zustand-persist и на первом рендере был недоступен. Здесь
 * initDataUnsafe.user.id доступен синхронно — причина гейта исчезла.
 */
export function openTelegramSession(): TelegramSession | null {
  const tg = typeof window === 'undefined' ? undefined : window.Telegram?.WebApp;

  if (tg) {
    // ready() говорит Telegram, что можно убирать заставку; expand() разворачивает
    // окно на всю высоту, иначе мини-апп открывается половинкой экрана.
    tg.ready();
    tg.expand();

    const user = tg.initDataUnsafe?.user;
    if (user?.id) {
      const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
      return { telegramId: String(user.id), userName: name || 'Пользователь' };
    }
  }

  // Отладка в обычном браузере. На бэкенде этот путь закрыт в production.
  if (env.isDevelopment && env.devUserId) {
    return { telegramId: env.devUserId, userName: 'Dev User' };
  }

  return null;
}

/**
 * Тему задаёт Telegram, а не операционная система: внутри клиента пользователь
 * мог выбрать тему, отличную от системной, и мини-апп обязан следовать ей.
 * Без этого приложение в тёмном Telegram осталось бы светлым.
 */
export function applyTelegramTheme(): void {
  const scheme = window.Telegram?.WebApp?.colorScheme;
  if (scheme === 'dark' || scheme === 'light') {
    document.documentElement.dataset.theme = scheme;
  }
}
