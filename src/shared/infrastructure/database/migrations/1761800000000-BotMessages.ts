import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FT-122: which records a bot message shows and which keyboard screen is open under it, so «Изменить»,
 * «Вернуть» and /undo keep working after a restart (until now the link lived in memory). One row per
 * Telegram message; the records stay in `transactions`.
 */
export class BotMessages1761800000000 implements MigrationInterface {
  name = 'BotMessages1761800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "bot_messages" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "chat_id" varchar NOT NULL, "message_id" integer NOT NULL, "record_ids" text NOT NULL, "mode" varchar NOT NULL DEFAULT ('confirm'), "state" text NOT NULL, "heard" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_bot_messages_message" ON "bot_messages" ("chat_id", "message_id") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_bot_messages_message"`);
    await queryRunner.query(`DROP TABLE "bot_messages"`);
  }
}
