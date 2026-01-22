import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateGuestId, isGuestId } from '@/shared/lib/utils/guestId';
import { db, localTransactionRepo } from '@/shared/lib/db';

export type UserType = 'guest' | 'telegram' | null;

interface UserState {
  // Identity
  userId: string | null;
  userName: string | null;
  userType: UserType;
  telegramId: string | null;

  // Hydration state (not persisted)
  _hasHydrated: boolean;

  // Sync state
  isOnline: boolean;
  lastSyncAt: number | null;
  pendingChangesCount: number;

  // Actions
  setUser: (userId: string, userName?: string) => void;
  clearUser: () => void;
  initGuest: () => void;
  setTelegramUser: (telegramId: string, userName?: string) => void;
  setHasHydrated: (state: boolean) => void;

  // Sync actions
  setOnlineStatus: (isOnline: boolean) => void;
  updatePendingCount: () => Promise<void>;
  setLastSyncAt: (timestamp: number) => void;
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

      // Sync state
      isOnline: navigator.onLine,
      lastSyncAt: null,
      pendingChangesCount: 0,

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
          lastSyncAt: null,
          pendingChangesCount: 0,
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
          lastSyncAt: null,
          pendingChangesCount: 0,
        });
      },

      /**
       * Set Telegram user (after authentication)
       */
      setTelegramUser: (telegramId: string, userName?: string) => {
        console.log('[UserStore] Setting Telegram user:', telegramId);

        // Save Telegram user to IndexedDB
        db.users.put({
          id: telegramId,
          type: 'telegram',
          telegramId,
          userName: userName || undefined,
          createdAt: Date.now(),
        });

        set({
          userId: telegramId,
          userName: userName || null,
          userType: 'telegram',
          telegramId,
        });
      },

      /**
       * Update online status
       */
      setOnlineStatus: (isOnline: boolean) => {
        set({ isOnline });
      },

      /**
       * Update pending changes count from IndexedDB
       */
      updatePendingCount: async () => {
        const { userId } = get();
        if (!userId) {
          set({ pendingChangesCount: 0 });
          return;
        }

        const count = await localTransactionRepo.getPendingCount(userId);
        set({ pendingChangesCount: count });
      },

      /**
       * Set last sync timestamp
       */
      setLastSyncAt: (timestamp: number) => {
        set({ lastSyncAt: timestamp });
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
        lastSyncAt: state.lastSyncAt,
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

/**
 * Setup online/offline listeners
 */
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useUserStore.getState().setOnlineStatus(true);
  });

  window.addEventListener('offline', () => {
    useUserStore.getState().setOnlineStatus(false);
  });
}
