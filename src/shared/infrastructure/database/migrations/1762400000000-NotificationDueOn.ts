import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FT-133: «Позже» under the bot's audit call brings it back once, the next day. The day is kept with the call's row
 * in `notifications_log` (`due_on`, YYYY-MM-DD), so a restart in between does not lose it.
 */
export class NotificationDueOn1762400000000 implements MigrationInterface {
  name = 'NotificationDueOn1762400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications_log" ADD COLUMN "due_on" varchar`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications_log" DROP COLUMN "due_on"`);
  }
}
