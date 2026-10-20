import { UserSettingsChanges, UserSettings } from './userSettings';

export interface UserSettingsRepository {
  /** The stored row, or null when the user never changed a setting. */
  findByUserId(userId: string): Promise<UserSettings | null>;
  /**
   * Write these fields and `updated_at`, nothing else; a user without a row gets one with the defaults and
   * these fields. One statement, so parallel writes of different fields all stay (FT-141). Returns what is
   * stored.
   */
  write(userId: string, changes: UserSettingsChanges): Promise<UserSettings>;
}
