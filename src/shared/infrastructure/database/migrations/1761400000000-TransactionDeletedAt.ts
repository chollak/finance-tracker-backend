import { MigrationInterface, QueryRunner } from 'typeorm';

/** FT-105: records are deleted softly, so a deletion can be undone. Nothing is deleted yet: all NULL. */
export class TransactionDeletedAt1761400000000 implements MigrationInterface {
  name = 'TransactionDeletedAt1761400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" ADD COLUMN "deleted_at" datetime`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Records deleted softly were deleted: going back means deleting them for real
    await queryRunner.query(`DELETE FROM "transactions" WHERE "deleted_at" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "deleted_at"`);
  }
}
