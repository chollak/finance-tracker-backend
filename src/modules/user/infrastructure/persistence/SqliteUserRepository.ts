/**
 * SQLite User Repository Implementation
 */

import { Repository } from 'typeorm';
import { AppDataSource } from '../../../../shared/infrastructure/database/database.config';
import { User as UserDomain, CreateUserDTO, UpdateUserDTO } from '../../domain/userEntity';
import { UserRepository } from '../../domain/userRepository';
import { User as UserEntity } from '../../../../shared/infrastructure/database/entities/User';

export class SqliteUserRepository implements UserRepository {
  private repository: Repository<UserEntity>;

  constructor() {
    this.repository = AppDataSource.getRepository(UserEntity);
  }

  async findById(id: string): Promise<UserDomain | null> {
    const entity = await this.repository.findOne({ where: { id } });
    return entity ? this.mapToUser(entity) : null;
  }

  async findByTelegramId(telegramId: string): Promise<UserDomain | null> {
    const entity = await this.repository.findOne({ where: { telegramId } });
    return entity ? this.mapToUser(entity) : null;
  }

  async create(dto: CreateUserDTO): Promise<UserDomain> {
    const entity = this.repository.create({
      telegramId: dto.telegramId,
      userName: dto.userName,
      firstName: dto.firstName,
      lastName: dto.lastName,
      languageCode: dto.languageCode || 'ru',
    });

    const saved = await this.repository.save(entity);
    return this.mapToUser(saved);
  }

  async update(id: string, dto: UpdateUserDTO): Promise<UserDomain> {
    await this.repository.update(id, {
      ...(dto.userName !== undefined && { userName: dto.userName }),
      ...(dto.firstName !== undefined && { firstName: dto.firstName }),
      ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      ...(dto.languageCode !== undefined && { languageCode: dto.languageCode }),
      ...(dto.defaultCurrency !== undefined && { defaultCurrency: dto.defaultCurrency }),
      ...(dto.timezone !== undefined && { timezone: dto.timezone }),
    });

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('User not found after update');
    }
    return updated;
  }

  async updateLastSeen(id: string): Promise<void> {
    await this.repository.update(id, { lastSeenAt: new Date() });
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async getOrCreate(dto: CreateUserDTO): Promise<UserDomain> {
    const existing = await this.findByTelegramId(dto.telegramId);
    if (existing) {
      await this.updateLastSeen(existing.id);
      return existing;
    }
    return this.create(dto);
  }

  private mapToUser(entity: UserEntity): UserDomain {
    return {
      id: entity.id,
      telegramId: entity.telegramId,
      userName: entity.userName,
      firstName: entity.firstName,
      lastName: entity.lastName,
      languageCode: entity.languageCode,
      defaultCurrency: entity.defaultCurrency,
      timezone: entity.timezone,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      lastSeenAt: entity.lastSeenAt,
    };
  }
}
