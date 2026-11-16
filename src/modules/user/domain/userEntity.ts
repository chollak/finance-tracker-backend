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

  // Settings. The column users.timezone stays in the table (data) but is no part of the user: nothing writes it since
  // #274, nothing reads it since #275 — every user is on Tashkent's clock (DEFAULT_TIME_ZONE)
  defaultCurrency?: string;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDTO {
  telegramId: string;
  userName?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
}
