import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FT-124: what the bot already sent on its own and for which period — the daily summary of a day for now; goal,
 * subscription and audit notices later (FT-131+). One row per user, kind and period, so a notice goes out at most
 * once whatever restarts or ticks twice.
 */
export class NotificationsLog1762000000000 implements MigrationInterface {
  name = 'NotificationsLog1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "notifications_log" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "kind" varchar NOT NULL, "period" varchar NOT NULL, "status" varchar NOT NULL DEFAULT ('sending'), "variant" varchar, "chat_id" varchar, "message_id" integer, "answer" varchar, "error" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_notifications_log_period" ON "notifications_log" ("user_id", "kind", "period") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_notifications_log_period"`);
    await queryRunner.query(`DROP TABLE "notifications_log"`);
  }
}
