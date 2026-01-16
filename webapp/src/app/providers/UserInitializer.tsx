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
  const { userId, userType, setTelegramUser, initGuest } = useUserStore();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    async function initialize() {
      // 1. Initialize IndexedDB
      try {
        await initDatabase();
      } catch (error) {
        console.error('[UserInitializer] Failed to initialize database:', error);
      }

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
          const currentUserId = useUserStore.getState().userId;
          const currentUserType = useUserStore.getState().userType;

          if (currentUserType === 'guest' && currentUserId) {
            console.log('[UserInitializer] Guest data exists, merging to Telegram account...');
            try {
              const mergeResult = await syncService.mergeGuestData(currentUserId, telegramUserId);
              console.log('[UserInitializer] Merge result:', mergeResult);
              if (mergeResult.errors.length > 0) {
                console.warn('[UserInitializer] Merge had errors:', mergeResult.errors);
              }
            } catch (error) {
              console.error('[UserInitializer] Failed to merge guest data:', error);
            }
          }

          setTelegramUser(telegramUserId, userName);
          setIsInitialized(true);
          return;
        }
      }

      // 3. Check if we already have a user session
      if (userId && userType) {
        console.log('[UserInitializer] Restored session:', { userId, userType });
        setIsInitialized(true);
        return;
      }

      // 4. Create guest user for new visitors
      console.log('[UserInitializer] Creating guest user');
      initGuest();
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
