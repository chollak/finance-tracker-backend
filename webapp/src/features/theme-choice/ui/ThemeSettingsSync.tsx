import { useEffect } from 'react';
import { useSavingSettings, useSettings } from '@/entities/settings';
import { isThemePreference, useThemeStore } from '@/shared/lib/theme';

/**
 * Puts the theme the user saved (the `theme` setting, FT-125) on this device once the settings are read, and again
 * whenever they change — chosen on another phone, or a save that failed and was taken back. While a change is on its
 * way it waits for the answer, so two quick choices never flicker back. Mounted once by the app.
 */
export function ThemeSettingsSync() {
  const saved = useSettings().data?.theme;
  const saving = useSavingSettings();
  const setPreference = useThemeStore((state) => state.setPreference);

  useEffect(() => {
    if (!saving && isThemePreference(saved)) setPreference(saved);
  }, [saved, saving, setPreference]);

  return null;
}
