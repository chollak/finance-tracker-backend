import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FT-164: a notice whose request never left the machine is no longer given up — it waits in `notifications_log` as
 * `not_sent` with how many times it was tried (`attempts`) and the last day it may still go out (`send_until`,
 * YYYY-MM-DD on the user's clock), so the count survives a restart and the notice is kept `failed` with the reason
 * once its window ends. Rows kept before get 0 attempts and no last day: they are all settled already.
 */
export class NotificationAttempts1762500000000 implements MigrationInterface {
  name = 'NotificationAttempts1762500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications_log" ADD COLUMN "attempts" integer NOT NULL DEFAULT (0)`);
    await queryRunner.query(`ALTER TABLE "notifications_log" ADD COLUMN "send_until" varchar`);
  }

  /** The older code does not know `not_sent`: such a notice is closed as failed, as it would have left it (FT-144). */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "notifications_log" SET "status" = 'failed' WHERE "status" = 'not_sent'`);
    await queryRunner.query(`ALTER TABLE "notifications_log" DROP COLUMN "send_until"`);
    await queryRunner.query(`ALTER TABLE "notifications_log" DROP COLUMN "attempts"`);
  }
}
