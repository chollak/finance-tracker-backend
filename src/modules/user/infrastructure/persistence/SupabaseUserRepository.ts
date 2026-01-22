/**
 * Supabase User Repository Implementation
 */

import { getSupabaseClient } from '../../../../shared/infrastructure/database/supabase.config';
import { User, CreateUserDTO, UpdateUserDTO } from '../../domain/userEntity';
import { UserRepository } from '../../domain/userRepository';
import { createLogger, LogCategory } from '../../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.USER);

export class SupabaseUserRepository implements UserRepository {
  private supabase = getSupabaseClient();

  async findById(id: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapToUser(data);
  }

  async findByTelegramId(telegramId: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapToUser(data);
  }

  async create(dto: CreateUserDTO): Promise<User> {
    const insertData = {
      telegram_id: dto.telegramId,
      user_name: dto.userName,
      first_name: dto.firstName,
      last_name: dto.lastName,
      language_code: dto.languageCode || 'ru',
    };

    const { data, error } = await this.supabase
      .from('users')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }

    return this.mapToUser(data);
  }

  async update(id: string, dto: UpdateUserDTO): Promise<User> {
    const updateData: Record<string, any> = {};

    if (dto.userName !== undefined) updateData.user_name = dto.userName;
    if (dto.firstName !== undefined) updateData.first_name = dto.firstName;
    if (dto.lastName !== undefined) updateData.last_name = dto.lastName;
    if (dto.languageCode !== undefined) updateData.language_code = dto.languageCode;
    if (dto.defaultCurrency !== undefined) updateData.default_currency = dto.defaultCurrency;
    if (dto.timezone !== undefined) updateData.timezone = dto.timezone;

    const { data, error } = await this.supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update user: ${error.message}`);
    }

    return this.mapToUser(data);
  }

  async updateLastSeen(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      logger.error(`Failed to update last seen: ${error.message}`);
    }
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }

  async getOrCreate(dto: CreateUserDTO): Promise<User> {
    // Try to find existing user
    const existing = await this.findByTelegramId(dto.telegramId);
    if (existing) {
      // Update last seen and return
      await this.updateLastSeen(existing.id);
      return existing;
    }

    // Create new user
    return this.create(dto);
  }

  private mapToUser(data: any): User {
    return {
      id: data.id,
      telegramId: data.telegram_id,
      userName: data.user_name,
      firstName: data.first_name,
      lastName: data.last_name,
      languageCode: data.language_code,
      defaultCurrency: data.default_currency,
      timezone: data.timezone,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      lastSeenAt: data.last_seen_at ? new Date(data.last_seen_at) : undefined,
    };
  }
}
