import { useEffect, useState } from 'react';
import { useUserStore } from '@/entities/user/model/store';
import { initDatabase, syncService } from '@/shared/lib/db';

/**
 * Initializes user data and database on app mount
 * Handles three scenarios:
 * 1. Telegram WebApp - authenticate with Telegram user
 * 2. Existing session - restore from localStorage
 * 3. New visitor - create guest user
 */
export function UserInitializer() {
  const userId = useUserStore((state) => state.userId);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    async function initialize() {
      // 1. Initialize IndexedDB
      try {
        await initDatabase();
      } catch (error) {
        console.error('[UserInitializer] Failed to initialize database:', error);
      }

      // Get current state (avoid stale closure from StrictMode double-invoke)
      const state = useUserStore.getState();

      // 2. Check if running in Telegram WebApp
      const telegramWebApp = window.Telegram?.WebApp;

      if (telegramWebApp) {
        telegramWebApp.ready();
        telegramWebApp.expand();

        const telegramUserId = telegramWebApp.initDataUnsafe?.user?.id?.toString();
        const userName = telegramWebApp.initDataUnsafe?.user?.first_name;

        if (telegramUserId) {
          console.log('[UserInitializer] Telegram user detected:', telegramUserId);

          // Check if we have guest data to merge
          if (state.userType === 'guest' && state.userId) {
            console.log('[UserInitializer] Guest data exists, merging to Telegram account...');
            try {
              const mergeResult = await syncService.mergeGuestData(state.userId, telegramUserId);
              console.log('[UserInitializer] Merge result:', mergeResult);
              if (mergeResult.errors.length > 0) {
                console.warn('[UserInitializer] Merge had errors:', mergeResult.errors);
              }
            } catch (error) {
              console.error('[UserInitializer] Failed to merge guest data:', error);
            }
          }

          state.setTelegramUser(telegramUserId, userName);
          setIsInitialized(true);
          return;
        }
      }

      // 3. Check if we already have a user session (use getState for fresh value)
      if (state.userId && state.userType) {
        console.log('[UserInitializer] Restored session:', { userId: state.userId, userType: state.userType });
        setIsInitialized(true);
        return;
      }

      // 4. Create guest user for new visitors
      console.log('[UserInitializer] Creating guest user');
      state.initGuest();
      setIsInitialized(true);
    }

    initialize();
  }, []);

  // Update pending count when user changes
  useEffect(() => {
    if (isInitialized && userId) {
      useUserStore.getState().updatePendingCount();
    }
  }, [isInitialized, userId]);

  return null;
}
