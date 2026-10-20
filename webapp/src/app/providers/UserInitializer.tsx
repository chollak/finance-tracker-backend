import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { readSession, useUserStore } from '@/entities/user';
import { onSessionLost } from '@/shared/api';
import { env } from '@/shared/config/env';
import { useUndoToastStore } from '@/shared/lib/undo';

/**
 * Who the app opens for (FT-128; guest mode went away by decision Д4):
 * 1. Inside Telegram — the Mini App's user (its initData signs every request).
 * 2. Development outside Telegram with VITE_MOCK_USER_ID — that user (`X-Dev-User-Id`).
 * 3. A browser — the session the bot confirmed (`GET /api/auth/session`, an httpOnly cookie); without one the login
 *    screen. A browser that cannot reach the server keeps the user it had, so the app still opens.
 * Later a 401 outside Telegram means the session ended (or «Выйти» in another tab): the login screen again.
 */
export function UserInitializer() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const state = useUserStore.getState();
      const telegramWebApp = window.Telegram?.WebApp;
      if (telegramWebApp) {
        telegramWebApp.ready();
        telegramWebApp.expand();
      }

      // 1. Telegram WebApp
      const telegramUser = telegramWebApp?.initDataUnsafe?.user;
      if (telegramUser?.id) {
        state.setTelegramUser(String(telegramUser.id), telegramUser.first_name, telegramUser.username);
        return;
      }

      // 2. Development mode: the mock user from env
      if (env.isDevelopment && env.mockUserId) {
        state.setTelegramUser(env.mockUserId, env.mockUserName);
        return;
      }

      // 3. A browser: its session
      try {
        const user = await readSession();
        if (cancelled) return;
        if (user) useUserStore.getState().setSessionUser(user);
        else useUserStore.getState().setSignedOut();
      } catch {
        if (cancelled) return;
        if (!useUserStore.getState().userId) useUserStore.getState().setSignedOut();
      }
    }

    void initialize();

    onSessionLost(() => {
      if (!useUserStore.getState().userId) return;
      useUserStore.getState().setSignedOut();
      useUndoToastStore.getState().clear();
      queryClient.clear();
    });

    return () => {
      cancelled = true;
      onSessionLost(null);
    };
  }, [queryClient]);

  return null;
}
