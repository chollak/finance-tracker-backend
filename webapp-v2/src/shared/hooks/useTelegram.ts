import { useEffect, useState } from 'react';
import type { TelegramWebApp } from '@/shared/types/common';
import { env } from '@/shared/config/env';

interface TelegramUser {
  userId: string | null;
  userName: string | null;
}

interface UseTelegramResult extends TelegramUser {
  isTelegram: boolean;
  webApp: TelegramWebApp | null;
  colorScheme: 'light' | 'dark';
  mainButton: TelegramWebApp['MainButton'] | null;
  backButton: TelegramWebApp['BackButton'] | null;
  ready: () => void;
  close: () => void;
  expand: () => void;
}

/**
 * Hook for Telegram WebApp integration
 * Provides user data and WebApp controls
 */
export function useTelegram(): UseTelegramResult {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [user, setUser] = useState<TelegramUser>({
    userId: null,
    userName: null,
  });

  useEffect(() => {
    const telegram = window.Telegram?.WebApp;

    if (telegram) {
      setWebApp(telegram);

      // Initialize Telegram WebApp
      telegram.ready();
      telegram.expand();

      // Extract user data
      const telegramUser = telegram.initDataUnsafe?.user;
      if (telegramUser) {
        setUser({
          userId: telegramUser.id.toString(),
          userName: telegramUser.first_name || null,
        });
      }
    } else if (env.isDevelopment) {
      // Mock user for development
      setUser({
        userId: env.mockUserId,
        userName: env.mockUserName,
      });
    }
  }, []);

  return {
    isTelegram: !!webApp,
    webApp,
    userId: user.userId,
    userName: user.userName,
    colorScheme: webApp?.colorScheme || 'light',
    mainButton: webApp?.MainButton || null,
    backButton: webApp?.BackButton || null,
    ready: () => webApp?.ready(),
    close: () => webApp?.close(),
    expand: () => webApp?.expand(),
  };
}

/**
 * Hook to control Telegram MainButton
 * @param options - Button configuration
 */
export function useTelegramMainButton(options: {
  text?: string;
  onClick?: () => void;
  visible?: boolean;
} = {}) {
  const { mainButton, isTelegram } = useTelegram();
  const { text, onClick, visible = true } = options;

  useEffect(() => {
    if (!isTelegram || !mainButton) return;

    if (text) {
      mainButton.setText(text);
    }

    if (visible) {
      mainButton.show();
    } else {
      mainButton.hide();
    }

    if (onClick) {
      mainButton.onClick(onClick);
    }

    return () => {
      if (onClick) {
        mainButton.offClick(onClick);
      }
      mainButton.hide();
    };
  }, [mainButton, isTelegram, text, onClick, visible]);
}

/**
 * Hook to control Telegram BackButton
 * @param onClick - Callback when back button is pressed
 * @param visible - Whether to show the back button
 */
export function useTelegramBackButton(
  onClick?: () => void,
  visible: boolean = true
) {
  const { backButton, isTelegram } = useTelegram();

  useEffect(() => {
    if (!isTelegram || !backButton) return;

    if (visible) {
      backButton.show();
    } else {
      backButton.hide();
    }

    if (onClick) {
      backButton.onClick(onClick);
    }

    return () => {
      if (onClick) {
        backButton.offClick(onClick);
      }
      backButton.hide();
    };
  }, [backButton, isTelegram, onClick, visible]);
}
