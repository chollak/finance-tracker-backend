import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { settingsKeys, useUpdateSettings, type UserSettings } from '@/entities/settings';
import { useUserStore } from '@/entities/user';
import { useThemeStore, type ThemePreference } from '@/shared/lib/theme';
import { showUndoToast } from '@/shared/lib/undo';
import { THEME_SAVE_FAILED } from '../model/themeChoice';

export interface ThemeChoice {
  preference: ThemePreference;
  /** Shows the theme at once and saves it as the user's setting; a save that failed puts the old one back. */
  choose: (preference: ThemePreference) => void;
}

/**
 * The theme the user chose (FT-125, board «Тема»). It is the `theme` setting, so it follows the user to the Mini App
 * on another phone and to the browser; the device applies it before the server answers. A guest has no settings:
 * the choice stays on this device.
 */
export function useThemeChoice(): ThemeChoice {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const userId = useUserStore((state) => state.userId);
  const signedIn = useUserStore((state) => state.userType === 'telegram' && !!state.userId);
  const queryClient = useQueryClient();
  const { mutate } = useUpdateSettings({ onError: () => showUndoToast({ kind: 'info', ...THEME_SAVE_FAILED }) });

  const choose = useCallback(
    (next: ThemePreference) => {
      const previous = useThemeStore.getState().preference;
      if (next === previous) return;
      setPreference(next);
      if (!signedIn) return;
      mutate(
        { theme: next },
        {
          // The settings in the cache are back to what the server keeps; without them, the device's previous choice
          onError: () => setPreference(queryClient.getQueryData<UserSettings>(settingsKeys.detail(userId ?? ''))?.theme ?? previous),
        }
      );
    },
    [setPreference, signedIn, mutate, queryClient, userId]
  );

  return { preference, choose };
}
