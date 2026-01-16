import { useEffect, useState } from 'react';
import type { TelegramWebApp, ThemeParams } from '@/shared/types/telegram';
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

/**
 * Hook for Telegram Haptic Feedback
 * Provides tactile feedback on mobile devices
 */
export function useTelegramHaptic() {
  const { webApp, isTelegram } = useTelegram();

  const impact = (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') => {
    if (isTelegram && webApp?.HapticFeedback) {
      webApp.HapticFeedback.impactOccurred(style);
    }
  };

  const notification = (type: 'error' | 'success' | 'warning') => {
    if (isTelegram && webApp?.HapticFeedback) {
      webApp.HapticFeedback.notificationOccurred(type);
    }
  };

  const selectionChanged = () => {
    if (isTelegram && webApp?.HapticFeedback) {
      webApp.HapticFeedback.selectionChanged();
    }
  };

  return {
    impact,
    notification,
    selectionChanged,
    isAvailable: isTelegram && !!webApp?.HapticFeedback,
  };
}

/**
 * Hook for Telegram Cloud Storage
 * Persists user data across devices
 */
export function useTelegramCloudStorage() {
  const { webApp, isTelegram } = useTelegram();

  const setItem = (key: string, value: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      if (!isTelegram || !webApp?.CloudStorage) {
        // Fallback to localStorage
        try {
          localStorage.setItem(`tg_${key}`, value);
          resolve(true);
        } catch (e) {
          reject(e);
        }
        return;
      }

      webApp.CloudStorage.setItem(key, value, (error, success) => {
        if (error) reject(error);
        else resolve(success ?? false);
      });
    });
  };

  const getItem = (key: string): Promise<string | null> => {
    return new Promise((resolve, reject) => {
      if (!isTelegram || !webApp?.CloudStorage) {
        // Fallback to localStorage
        resolve(localStorage.getItem(`tg_${key}`));
        return;
      }

      webApp.CloudStorage.getItem(key, (error, value) => {
        if (error) reject(error);
        else resolve(value ?? null);
      });
    });
  };

  const removeItem = (key: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      if (!isTelegram || !webApp?.CloudStorage) {
        localStorage.removeItem(`tg_${key}`);
        resolve(true);
        return;
      }

      webApp.CloudStorage.removeItem(key, (error, success) => {
        if (error) reject(error);
        else resolve(success ?? false);
      });
    });
  };

  const getKeys = (): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      if (!isTelegram || !webApp?.CloudStorage) {
        // Fallback: get localStorage keys with tg_ prefix
        const keys = Object.keys(localStorage)
          .filter(k => k.startsWith('tg_'))
          .map(k => k.replace('tg_', ''));
        resolve(keys);
        return;
      }

      webApp.CloudStorage.getKeys((error, keys) => {
        if (error) reject(error);
        else resolve(keys ?? []);
      });
    });
  };

  return {
    setItem,
    getItem,
    removeItem,
    getKeys,
    isAvailable: isTelegram && !!webApp?.CloudStorage,
  };
}

/**
 * Hook for Telegram Theme integration
 * Adapts UI to Telegram's theme
 */
export function useTelegramTheme() {
  const { webApp, isTelegram, colorScheme } = useTelegram();
  const [themeParams, setThemeParams] = useState<ThemeParams>({});

  useEffect(() => {
    if (isTelegram && webApp) {
      setThemeParams(webApp.themeParams || {});

      // Listen for theme changes
      const handleThemeChange = () => {
        setThemeParams(webApp.themeParams || {});
      };

      webApp.onEvent('themeChanged', handleThemeChange);

      return () => {
        webApp.offEvent('themeChanged', handleThemeChange);
      };
    }
  }, [isTelegram, webApp]);

  // Apply theme to CSS variables
  useEffect(() => {
    if (!isTelegram) return;

    const root = document.documentElement;

    if (themeParams.bg_color) {
      root.style.setProperty('--tg-bg-color', themeParams.bg_color);
    }
    if (themeParams.text_color) {
      root.style.setProperty('--tg-text-color', themeParams.text_color);
    }
    if (themeParams.hint_color) {
      root.style.setProperty('--tg-hint-color', themeParams.hint_color);
    }
    if (themeParams.link_color) {
      root.style.setProperty('--tg-link-color', themeParams.link_color);
    }
    if (themeParams.button_color) {
      root.style.setProperty('--tg-button-color', themeParams.button_color);
    }
    if (themeParams.button_text_color) {
      root.style.setProperty('--tg-button-text-color', themeParams.button_text_color);
    }
    if (themeParams.secondary_bg_color) {
      root.style.setProperty('--tg-secondary-bg-color', themeParams.secondary_bg_color);
    }
  }, [themeParams, isTelegram]);

  return {
    colorScheme,
    themeParams,
    isDark: colorScheme === 'dark',
    isLight: colorScheme === 'light',
    isAvailable: isTelegram,
  };
}

/**
 * Hook for Telegram popup dialogs
 */
export function useTelegramPopup() {
  const { webApp, isTelegram } = useTelegram();

  const showAlert = (message: string): Promise<void> => {
    return new Promise((resolve) => {
      if (isTelegram && webApp?.showAlert) {
        webApp.showAlert(message, resolve);
      } else {
        alert(message);
        resolve();
      }
    });
  };

  const showConfirm = (message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (isTelegram && webApp?.showConfirm) {
        webApp.showConfirm(message, resolve);
      } else {
        resolve(confirm(message));
      }
    });
  };

  const showPopup = (params: {
    title?: string;
    message: string;
    buttons?: Array<{
      id?: string;
      type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive';
      text: string;
    }>;
  }): Promise<string> => {
    return new Promise((resolve) => {
      if (isTelegram && webApp?.showPopup) {
        webApp.showPopup(params, resolve);
      } else {
        // Fallback: use native confirm/alert
        if (params.buttons && params.buttons.length > 0) {
          const result = confirm(`${params.title || ''}\n${params.message}`);
          resolve(result ? params.buttons[0].id || '0' : 'cancel');
        } else {
          alert(`${params.title || ''}\n${params.message}`);
          resolve('ok');
        }
      }
    });
  };

  return {
    showAlert,
    showConfirm,
    showPopup,
    isAvailable: isTelegram,
  };
}
