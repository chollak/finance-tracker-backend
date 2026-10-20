import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FT-123: what the chat's next text is read as — the new amount after «Сумму», «Сколько?» of an item named
 * without an amount, the right amount of a large one. Derived from `mode` and `state` on every write; a
 * message already waiting for an amount after «Сумму» keeps waiting.
 */
export class BotMessageQuestion1761900000000 implements MigrationInterface {
  name = 'BotMessageQuestion1761900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bot_messages" ADD COLUMN "question" varchar`);
    await queryRunner.query(`UPDATE "bot_messages" SET "question" = 'amount' WHERE "mode" = 'amount'`);
    await queryRunner.query(`CREATE INDEX "IDX_bot_messages_question" ON "bot_messages" ("chat_id", "question") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_bot_messages_question"`);
    await queryRunner.query(`ALTER TABLE "bot_messages" DROP COLUMN "question"`);
  }
}
