import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { THEME_STORAGE_KEY, type ResolvedTheme, type ThemePreference } from './resolveTheme';

/**
 * localStorage can be missing or throw inside some WebViews and private windows; the theme then
 * simply is not remembered between opens, and the app still renders.
 * The user's choice is the `theme` setting on the server (FT-125, features/theme-choice): this copy only paints the
 * first frame before the settings are read (index.html), and the login screen, where nobody is signed in yet.
 */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // not remembered — acceptable
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // nothing to remove
    }
  },
};

interface ThemeState {
  preference: ThemePreference;
  /** What is on screen now; set by ThemeController. */
  resolved: ResolvedTheme;
  /**
   * What the automatic theme gives right now — Telegram's light or dark inside Telegram, the system's elsewhere —
   * whatever the user chose; set by ThemeController as Telegram or the system change it («Тема» names it, FT-125).
   */
  automatic: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  setResolved: (resolved: ResolvedTheme, automatic: ResolvedTheme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: 'telegram',
      resolved: 'light',
      automatic: 'light',
      setPreference: (preference) => set({ preference }),
      setResolved: (resolved, automatic) => set({ resolved, automatic }),
    }),
    {
      name: THEME_STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ preference: state.preference }),
    }
  )
);
