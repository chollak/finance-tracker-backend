import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FT-172: the chat messages the bot handled, by their client id, so a message Telegram sends again after a restart is
 * recognised whatever it did — /undo, any number of answers to a question, an answer to an old message — and the
 * confirmation of its records survives until it is sent. Until now an answer was kept as `answeredBy` in the state of
 * the bot message it answered; those are copied here, so a message answered just before the update is not applied
 * twice after it.
 */
export class HandledMessages1762700000000 implements MigrationInterface {
  name = 'HandledMessages1762700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "handled_messages" ("client_id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "chat_id" varchar NOT NULL, "bot_message_id" integer, "confirmation" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE INDEX "IDX_handled_messages_created" ON "handled_messages" ("created_at") `);

    const answered: Array<{ user_id: string; chat_id: string; message_id: number; state: string; updated_at: string }> = await queryRunner.query(
      `SELECT "user_id", "chat_id", "message_id", "state", "updated_at" FROM "bot_messages" WHERE "state" LIKE '%"answeredBy"%'`
    );
    for (const row of answered) {
      const clientId = answeredBy(row.state);
      if (!clientId) continue;
      await queryRunner.query(
        `INSERT OR IGNORE INTO "handled_messages" ("client_id", "user_id", "chat_id", "bot_message_id", "created_at") VALUES (?, ?, ?, ?, ?)`,
        [clientId, row.user_id, row.chat_id, row.message_id, row.updated_at]
      );
    }
  }

  /** The older code reads answers from `answeredBy` in the states again; those kept here since are not there. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_handled_messages_created"`);
    await queryRunner.query(`DROP TABLE "handled_messages"`);
  }
}

function answeredBy(state: string): string | null {
  try {
    const parsed = JSON.parse(state);
    return typeof parsed?.answeredBy === 'string' && parsed.answeredBy ? parsed.answeredBy : null;
  } catch {
    return null;
  }
}
