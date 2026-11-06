/**
 * User Repository Interface
 *
 * A user is made only by getOrCreate (FT-140), on the first request or message. No route changes a user's row since
 * `/api/users` went (#274): settings live in `user_settings`.
 */

import { User, CreateUserDTO } from './userEntity';

export interface UserRepository {
  /**
   * Find user by UUID
   */
  findById(id: string): Promise<User | null>;

  /**
   * Find user by Telegram ID
   */
  findByTelegramId(telegramId: string): Promise<User | null>;

  /**
   * Update last seen timestamp
   */
  updateLastSeen(id: string): Promise<void>;

  /**
   * Get or create user by Telegram ID
   */
  getOrCreate(dto: CreateUserDTO): Promise<User>;

  /** Every user, oldest first — the bot's daily summary goes through them (FT-124). */
  findAll(): Promise<User[]>;
}
