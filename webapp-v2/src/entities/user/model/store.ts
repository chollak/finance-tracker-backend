import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  userId: string | null;
  userName: string | null;
  setUser: (userId: string, userName?: string) => void;
  clearUser: () => void;
}

/**
 * User store using Zustand
 * Persists to localStorage
 */
export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userId: null,
      userName: null,

      setUser: (userId: string, userName?: string) =>
        set({ userId, userName: userName || null }),

      clearUser: () => set({ userId: null, userName: null }),
    }),
    {
      name: 'finance-tracker-user',
    }
  )
);
