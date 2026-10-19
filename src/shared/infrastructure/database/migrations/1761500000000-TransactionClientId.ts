import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FT-106: the client's id for a record, unique per user, so a request the offline queue repeats returns
 * the same record. Older records have none; SQLite lets any number of NULLs share a unique index.
 */
export class TransactionClientId1761500000000 implements MigrationInterface {
  name = 'TransactionClientId1761500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" ADD COLUMN "client_id" varchar`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_transactions_user_client" ON "transactions" ("userId", "client_id") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_transactions_user_client"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "client_id"`);
  }
}
