import { UserSettings } from './userSettings';

export interface UserSettingsRepository {
  /** The stored row, or null when the user never changed a setting. */
  findByUserId(userId: string): Promise<UserSettings | null>;
  /** Insert or replace the user's row; returns what is stored. */
  upsert(settings: UserSettings): Promise<UserSettings>;
}
