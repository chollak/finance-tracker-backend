import { MigrationInterface, QueryRunner } from 'typeorm';

/** FT-104: transfers, exchanges and balance adjustments between the user's own accounts. */
export class AccountMoves1761300000000 implements MigrationInterface {
  name = 'AccountMoves1761300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "account_moves" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "kind" varchar NOT NULL, "from_account_id" varchar, "to_account_id" varchar NOT NULL, "from_amount_minor" bigint, "to_amount_minor" bigint NOT NULL, "deal_rate_minor" bigint, "cbu_rate_minor" bigint, "date" date NOT NULL, "note" varchar(200), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
    await queryRunner.query(`CREATE INDEX "IDX_account_moves_user" ON "account_moves" ("user_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_account_moves_from" ON "account_moves" ("from_account_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_account_moves_to" ON "account_moves" ("to_account_id") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_account_moves_to"`);
    await queryRunner.query(`DROP INDEX "IDX_account_moves_from"`);
    await queryRunner.query(`DROP INDEX "IDX_account_moves_user"`);
    await queryRunner.query(`DROP TABLE "account_moves"`);
  }
}
