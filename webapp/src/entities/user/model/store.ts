import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateGuestId, isGuestId } from '@/shared/lib/utils/guestId';
import { db, clearDatabase } from '@/shared/lib/db';

export type UserType = 'guest' | 'telegram' | null;

interface UserState {
  // Identity
  userId: string | null;
  userName: string | null;
  userType: UserType;
  telegramId: string | null;

  // Hydration state (not persisted)
  _hasHydrated: boolean;

  // Actions
  setUser: (userId: string, userName?: string) => void;
  clearUser: () => void;
  initGuest: () => void;
  setTelegramUser: (telegramId: string, userName?: string) => Promise<void>;
  setHasHydrated: (state: boolean) => void;
}

/**
 * User store using Zustand
 * Supports guest mode and Telegram authentication
 * Persists to localStorage
 */
export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      // Identity
      userId: null,
      userName: null,
      userType: null,
      telegramId: null,

      // Hydration state
      _hasHydrated: false,

      /**
       * Set hydration state (called by persist middleware)
       */
      setHasHydrated: (state: boolean) => {
        set({ _hasHydrated: state });
      },

      /**
       * Set user (legacy - for backwards compatibility)
       */
      setUser: (userId: string, userName?: string) => {
        const userType: UserType = isGuestId(userId) ? 'guest' : 'telegram';
        set({
          userId,
          userName: userName || null,
          userType,
          telegramId: userType === 'telegram' ? userId : null,
        });
      },

      /**
       * Clear user data
       */
      clearUser: () =>
        set({
          userId: null,
          userName: null,
          userType: null,
          telegramId: null,
        }),

      /**
       * Initialize as guest user
       * Idempotent: won't create duplicate if guest already exists
       */
      initGuest: () => {
        // Prevent duplicate guest creation (StrictMode double-invoke)
        const currentState = get();
        if (currentState.userId && currentState.userType === 'guest') {
          console.log('[UserStore] Guest already exists, skipping:', currentState.userId);
          return;
        }

        const guestId = generateGuestId();
        console.log('[UserStore] Initializing guest user:', guestId);

        // Save guest user to IndexedDB
        db.users.put({
          id: guestId,
          type: 'guest',
          userName: 'Guest',
          createdAt: Date.now(),
        });

        set({
          userId: guestId,
          userName: 'Guest',
          userType: 'guest',
          telegramId: null,
        });
      },

      /**
       * Set Telegram user (after authentication)
       * Clears any existing guest data from IndexedDB
       */
      setTelegramUser: async (telegramId: string, userName?: string) => {
        const currentState = get();

        // Clear guest data from IndexedDB when switching to Telegram
        if (currentState.userType === 'guest' && currentState.userId) {
          console.log('[UserStore] Clearing guest data before Telegram switch');
          try {
            await clearDatabase();
          } catch (error) {
            console.error('[UserStore] Failed to clear guest data:', error);
          }
        }

        console.log('[UserStore] Setting Telegram user:', telegramId);

        set({
          userId: telegramId,
          userName: userName || null,
          userType: 'telegram',
          telegramId,
        });
      },
    }),
    {
      name: 'finance-tracker-user',
      partialize: (state) => ({
        // Only persist these fields (exclude _hasHydrated)
        userId: state.userId,
        userName: state.userName,
        userType: state.userType,
        telegramId: state.telegramId,
      }),
      onRehydrateStorage: () => (state) => {
        // Called after rehydration completes
        state?.setHasHydrated(true);
      },
    }
  )
);

/**
 * Hook to check if store has been hydrated from localStorage
 * Use this to prevent rendering with stale initial state
 */
export function useHasHydrated(): boolean {
  return useUserStore((state) => state._hasHydrated);
}

/**
 * Hook to check if user is in guest mode
 */
export function useIsGuest(): boolean {
  return useUserStore((state) => state.userType === 'guest');
}

/**
 * Hook to check if user is authenticated via Telegram
 */
export function useIsTelegramUser(): boolean {
  return useUserStore((state) => state.userType === 'telegram');
}
