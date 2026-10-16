import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FT-103: every record states its currency and where it came from. All records so far are in сум on
 * «Карта» (FT-101), so `currency` defaults to UZS; the source of older records is unknown (null).
 */
export class RecordCurrencySource1761200000000 implements MigrationInterface {
  name = 'RecordCurrencySource1761200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" ADD COLUMN "currency" varchar NOT NULL DEFAULT ('UZS')`);
    await queryRunner.query(`ALTER TABLE "transactions" ADD COLUMN "source" varchar`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "source"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "currency"`);
  }
}
