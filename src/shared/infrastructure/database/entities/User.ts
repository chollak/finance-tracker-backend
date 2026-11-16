import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
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

  /**
   * Does not move on reads since #335: the only update of a `users` row was getOrCreate writing `last_seen_at`, and
   * `@UpdateDateColumn` moved this with it on every request. A user made since keeps the time of creation, an older
   * one the time of their last request before #335. Nothing reads it.
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /**
   * Not written since #335: getOrCreate set it on every request, and nothing read it. The column stays as the rows
   * have it — dropping it is a migration. `updated_at` stopped moving with it.
   */
  @Column({ name: 'last_seen_at', type: 'datetime', nullable: true })
  lastSeenAt?: Date;
}
