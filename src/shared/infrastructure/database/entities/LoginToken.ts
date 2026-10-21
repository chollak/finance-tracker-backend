import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * A sign-in to the web app through the bot (FT-128). The row starts as a login: `token` is the one-time code of the
 * link `t.me/<bot>?start=login_<token>`, `browser_hash` the hash of the secret the browser keeps in an httpOnly
 * cookie to ask how its login went. The bot binds it to the Telegram user who opened the link (`telegram_id`), and
 * «Подтвердить» or «Это не я» answers it within 5 minutes (`expires_at`). A confirmed login becomes the browser's
 * session: `session_hash` is the hash of the session cookie, valid until `session_expires_at` or «Выйти».
 */
@Entity('login_tokens')
@Index('IDX_login_tokens_token', ['token'], { unique: true })
@Index('IDX_login_tokens_browser', ['browserHash'], { unique: true })
@Index('IDX_login_tokens_session', ['sessionHash'], { unique: true })
export class LoginToken {
  @PrimaryColumn()
  id!: string;

  @Column()
  token!: string;

  @Column({ name: 'browser_hash' })
  browserHash!: string;

  @Column('varchar', { name: 'session_hash', nullable: true })
  sessionHash!: string | null;

  @Column({ default: 'pending' })
  status!: string;

  @Column()
  device!: string;

  @Column('varchar', { name: 'telegram_id', nullable: true })
  telegramId!: string | null;

  @Column('datetime', { name: 'expires_at' })
  expiresAt!: Date;

  @Column('datetime', { name: 'confirmed_at', nullable: true })
  confirmedAt!: Date | null;

  @Column('datetime', { name: 'session_expires_at', nullable: true })
  sessionExpiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
