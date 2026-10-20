// Settings entity: the user's settings from the API (FT-098)

export type { UserSettings, SettingsPatch } from './model/types';
export { useSettings, settingsKeys } from './api/queries';
export { useUpdateSettings } from './api/mutations';
