import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FT-128: signing in to the web app through the bot. One row per login: the one-time code of the bot link, the hash
 * of the browser's waiting cookie, who opened it in Telegram and how they answered within 5 minutes; a confirmed
 * login turns into the browser's session (the hash of the session cookie and when it ends).
 */
export class LoginTokens1762100000000 implements MigrationInterface {
  name = 'LoginTokens1762100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "login_tokens" ("id" varchar PRIMARY KEY NOT NULL, "token" varchar NOT NULL, "browser_hash" varchar NOT NULL, "session_hash" varchar, "status" varchar NOT NULL DEFAULT ('pending'), "device" varchar NOT NULL, "telegram_id" varchar, "expires_at" datetime NOT NULL, "confirmed_at" datetime, "session_expires_at" datetime, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_login_tokens_token" ON "login_tokens" ("token") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_login_tokens_browser" ON "login_tokens" ("browser_hash") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_login_tokens_session" ON "login_tokens" ("session_hash") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_login_tokens_session"`);
    await queryRunner.query(`DROP INDEX "IDX_login_tokens_browser"`);
    await queryRunner.query(`DROP INDEX "IDX_login_tokens_token"`);
    await queryRunner.query(`DROP TABLE "login_tokens"`);
  }
}
