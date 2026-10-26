import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The signed-in account. There is one kind since guest mode went away (decision Д4, FT-128): a Telegram account,
 * signed in by the Mini App's initData or, in a browser, by the session the bot confirmed. `null` — nobody yet.
 */
export type UserType = 'telegram' | null;

/** Who a browser session belongs to (`GET /api/auth/session`). */
export interface SessionUser {
  telegramId: string;
  firstName: string | null;
  username: string | null;
}

interface UserState {
  // Identity
  userId: string | null;
  userName: string | null;
  /** The @username, for «Аккаунт» in a browser; Telegram's own name in the Mini App. */
  username: string | null;
  userType: UserType;
  telegramId: string | null;

  /**
   * In a browser: the session was checked and there is none, or «Выйти» was pressed — the login screen shows. Not
   * persisted: every start checks again.
   */
  signedOut: boolean;

  // Hydration state (not persisted)
  _hasHydrated: boolean;

  // Actions
  setTelegramUser: (telegramId: string, userName?: string, username?: string) => void;
  /** A browser signed in through the bot (FT-128). */
  setSessionUser: (user: SessionUser) => void;
  /** Nobody is signed in in this browser: the login screen. */
  setSignedOut: () => void;
  setHasHydrated: (state: boolean) => void;
}

const SIGNED_OUT = { userId: null, userName: null, username: null, userType: null, telegramId: null } as const;

/**
 * User store using Zustand. Persists to localStorage, so a browser with a session opens the app at once while the
 * session is checked again.
 */
export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      ...SIGNED_OUT,
      signedOut: false,

      // Hydration state
      _hasHydrated: false,

      setHasHydrated: (state: boolean) => {
        set({ _hasHydrated: state });
      },

      setTelegramUser: (telegramId: string, userName?: string, username?: string) =>
        set({
          userId: telegramId,
          userName: userName || null,
          username: username || null,
          userType: 'telegram',
          telegramId,
          signedOut: false,
        }),

      setSessionUser: (user: SessionUser) =>
        set({
          userId: user.telegramId,
          userName: user.firstName,
          username: user.username,
          userType: 'telegram',
          telegramId: user.telegramId,
          signedOut: false,
        }),

      setSignedOut: () => set({ ...SIGNED_OUT, signedOut: true }),
    }),
    {
      name: 'finance-tracker-user',
      // 1: guest mode went away (FT-128); a guest kept from before is nobody
      version: 1,
      migrate: (persisted) => withoutGuest(persisted),
      partialize: (state) => ({
        // Only persist these fields (exclude _hasHydrated and signedOut)
        userId: state.userId,
        userName: state.userName,
        username: state.username,
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

/** What is kept in localStorage. */
type PersistedUser = Pick<UserState, 'userId' | 'userName' | 'username' | 'userType' | 'telegramId'>;

/** What an older version kept: a guest (`guest_…`, `userType: 'guest'`) is dropped — there are no guests now. */
export function withoutGuest(persisted: unknown): PersistedUser {
  const state = (persisted ?? {}) as Partial<Record<keyof UserState, unknown>>;
  const userId = typeof state.userId === 'string' ? state.userId : null;
  if (!userId || state.userType !== 'telegram' || userId.startsWith('guest_')) return { ...SIGNED_OUT };
  return {
    userId,
    userName: typeof state.userName === 'string' ? state.userName : null,
    username: typeof state.username === 'string' ? state.username : null,
    userType: 'telegram',
    telegramId: userId,
  };
}

/**
 * Hook to check if store has been hydrated from localStorage
 * Use this to prevent rendering with stale initial state
 */
export function useHasHydrated(): boolean {
  return useUserStore((state) => state._hasHydrated);
}
