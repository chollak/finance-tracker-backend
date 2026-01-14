import { useEffect } from 'react';
import { useUserStore } from '@/entities/user';

/**
 * Initializes user data on app mount
 * Extracts userId from Telegram WebApp or uses mock for development
 */
export function UserInitializer() {
  const setUser = useUserStore((state) => state.setUser);

  useEffect(() => {
    // Check if running in Telegram WebApp
    const telegramWebApp = window.Telegram?.WebApp;

    if (telegramWebApp) {
      telegramWebApp.ready();
      telegramWebApp.expand();

      const userId = telegramWebApp.initDataUnsafe?.user?.id?.toString();
      const userName = telegramWebApp.initDataUnsafe?.user?.first_name;

      if (userId) {
        setUser(userId, userName);
        return;
      }
    }

    // Development fallback - use mock user
    if (import.meta.env.DEV) {
      console.warn('[UserInitializer] Running in dev mode with mock user');
      setUser('dev-user-123', 'Dev User');
    }
  }, [setUser]);

  return null;
}
