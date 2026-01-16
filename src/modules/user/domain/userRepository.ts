/**
 * User Repository Interface
 */

import { User, CreateUserDTO, UpdateUserDTO } from './userEntity';

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
   * Create a new user
   */
  create(dto: CreateUserDTO): Promise<User>;

  /**
   * Update user
   */
  update(id: string, dto: UpdateUserDTO): Promise<User>;

  /**
   * Update last seen timestamp
   */
  updateLastSeen(id: string): Promise<void>;

  /**
   * Delete user
   */
  delete(id: string): Promise<void>;

  /**
   * Get or create user by Telegram ID
   */
  getOrCreate(dto: CreateUserDTO): Promise<User>;
}
