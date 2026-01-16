/**
 * User Domain Entity
 */

export interface User {
  id: string;                    // UUID
  telegramId: string;            // Telegram user ID (unique)
  userName?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;

  // Settings
  defaultCurrency?: string;
  timezone?: string;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt?: Date;
}

export interface CreateUserDTO {
  telegramId: string;
  userName?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
}

export interface UpdateUserDTO {
  userName?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  defaultCurrency?: string;
  timezone?: string;
}
