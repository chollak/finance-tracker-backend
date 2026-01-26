import { useEffect } from 'react';
import { useUserStore } from '@/entities/user/model/store';
import { initDatabase } from '@/shared/lib/db';
import { env } from '@/shared/config/env';

/**
 * Initializes user data and database on app mount
 *
 * Handles four scenarios:
 * 1. Telegram WebApp - authenticate with Telegram user (server-only mode)
 * 2. Development mode - use mock user from env (server mode)
 * 3. Existing session - restore from localStorage
 * 4. New visitor - create guest user (IndexedDB mode)
 *
 * Architecture:
 * - Telegram users use server API directly (no local storage)
 * - Guest users use IndexedDB only (offline-first)
 * - When guest logs in via Telegram, IndexedDB is cleared
 */
export function UserInitializer() {
  useEffect(() => {
    async function initialize() {
      // Get current state (avoid stale closure from StrictMode double-invoke)
      const state = useUserStore.getState();

      // 1. Check if running in Telegram WebApp
      const telegramWebApp = window.Telegram?.WebApp;

      if (telegramWebApp) {
        telegramWebApp.ready();
        telegramWebApp.expand();

        const telegramUserId = telegramWebApp.initDataUnsafe?.user?.id?.toString();
        const userName = telegramWebApp.initDataUnsafe?.user?.first_name;

        if (telegramUserId) {
          console.log('[UserInitializer] Telegram user detected:', telegramUserId);

          // setTelegramUser will clear IndexedDB if switching from guest
          await state.setTelegramUser(telegramUserId, userName);
          return;
        }
      }

      // 2. Development mode: use mock user from env
      if (env.isDevelopment && env.mockUserId && env.mockUserId !== '123456789') {
        console.log('[UserInitializer] Development mode - using mock user:', env.mockUserId);
        await state.setTelegramUser(env.mockUserId, env.mockUserName);
        return;
      }

      // 3. Check if we already have a user session
      if (state.userId && state.userType) {
        console.log('[UserInitializer] Restored session:', {
          userId: state.userId,
          userType: state.userType,
        });

        // Initialize IndexedDB for guest users only
        if (state.userType === 'guest') {
          try {
            await initDatabase();
          } catch (error) {
            console.error('[UserInitializer] Failed to initialize database:', error);
          }
        }

        return;
      }

      // 4. Create guest user for new visitors
      console.log('[UserInitializer] Creating guest user');

      // Initialize IndexedDB for guest users
      try {
        await initDatabase();
      } catch (error) {
        console.error('[UserInitializer] Failed to initialize database:', error);
      }

      state.initGuest();
    }

    initialize();
  }, []);

  return null;
}
