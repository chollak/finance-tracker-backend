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

  /** Before FT-103 every amount was in сум: dollar records cannot go back without becoming сум. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ count }] = await queryRunner.query(`SELECT COUNT(*) AS "count" FROM "transactions" WHERE "currency" <> 'UZS'`);
    if (Number(count) > 0) {
      throw new Error(
        `FT-103: ${count} record(s) are in dollars; without the currency column they would read as сум. ` +
        'Move or delete them first. Nothing was changed.'
      );
    }
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "source"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "currency"`);
  }
}
