import { MigrationInterface, QueryRunner } from 'typeorm';

/** FT-098: per-user settings. No rows are created — a user without a row has the domain defaults. */
export class UserSettings1760800000000 implements MigrationInterface {
  name = 'UserSettings1760800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "user_settings" ("user_id" varchar PRIMARY KEY NOT NULL, "theme" varchar NOT NULL DEFAULT ('telegram'), "daily_summary_enabled" boolean NOT NULL DEFAULT (1), "daily_summary_time" varchar NOT NULL DEFAULT ('21:00'), "audit_enabled" boolean NOT NULL DEFAULT (1), "audit_time" varchar NOT NULL DEFAULT ('10:00'), "goal_alerts_enabled" boolean NOT NULL DEFAULT (1), "fx_own_rate_minor" bigint, "fx_own_since" date, "default_account_id" varchar, "onboarded_at" datetime, "receipt_tips_seen" integer NOT NULL DEFAULT (0), "audit_invite_snoozed_until" date, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_settings"`);
  }
}
