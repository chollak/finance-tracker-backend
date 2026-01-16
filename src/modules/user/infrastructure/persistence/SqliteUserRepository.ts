/**
 * SQLite User Repository Implementation
 */

import { Repository } from 'typeorm';
import { AppDataSource } from '../../../../shared/infrastructure/database/database.config';
import { User, CreateUserDTO, UpdateUserDTO } from '../../domain/userEntity';
import { UserRepository } from '../../domain/userRepository';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'telegram_id', unique: true })
  telegramId!: string;

  @Column({ name: 'user_name', nullable: true })
  userName?: string;

  @Column({ name: 'first_name', nullable: true })
  firstName?: string;

  @Column({ name: 'last_name', nullable: true })
  lastName?: string;

  @Column({ name: 'language_code', default: 'ru' })
  languageCode!: string;

  @Column({ name: 'default_currency', default: 'UZS' })
  defaultCurrency!: string;

  @Column({ default: 'Asia/Tashkent' })
  timezone!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'last_seen_at', type: 'datetime', nullable: true })
  lastSeenAt?: Date;
}

export class SqliteUserRepository implements UserRepository {
  private repository: Repository<UserEntity>;

  constructor() {
    this.repository = AppDataSource.getRepository(UserEntity);
  }

  async findById(id: string): Promise<User | null> {
    const entity = await this.repository.findOne({ where: { id } });
    return entity ? this.mapToUser(entity) : null;
  }

  async findByTelegramId(telegramId: string): Promise<User | null> {
    const entity = await this.repository.findOne({ where: { telegramId } });
    return entity ? this.mapToUser(entity) : null;
  }

  async create(dto: CreateUserDTO): Promise<User> {
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

  async update(id: string, dto: UpdateUserDTO): Promise<User> {
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

  async getOrCreate(dto: CreateUserDTO): Promise<User> {
    const existing = await this.findByTelegramId(dto.telegramId);
    if (existing) {
      await this.updateLastSeen(existing.id);
      return existing;
    }
    return this.create(dto);
  }

  private mapToUser(entity: UserEntity): User {
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
