import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FT-142: an audit's candidates are found again on every read until the first mark or «Готово», and kept as they are
 * from then on. An audit kept before already has its candidates fixed by reading; one with a mark, a chosen goal or
 * an audit day stays so, the others are found again on their next read.
 */
export class AuditFrozen1762300000000 implements MigrationInterface {
  name = 'AuditFrozen1762300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audits" ADD COLUMN "frozen" boolean NOT NULL DEFAULT (0)`);
    await queryRunner.query(
      `UPDATE "audits" SET "frozen" = 1 WHERE "done_on" IS NOT NULL OR "candidates" LIKE '%"decision":"%' OR "candidates" LIKE '%"goalChoice":"%'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audits" DROP COLUMN "frozen"`);
  }
}
