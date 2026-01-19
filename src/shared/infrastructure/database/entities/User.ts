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

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'last_seen_at', type: 'datetime', nullable: true })
  lastSeenAt?: Date;
}
