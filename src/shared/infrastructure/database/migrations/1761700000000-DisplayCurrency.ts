import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FT-137: the currency Home shows the balance and the month tiles in («Сум / USD»). Settings saved before
 * read as сум, as Home showed them until now.
 */
export class DisplayCurrency1761700000000 implements MigrationInterface {
  name = 'DisplayCurrency1761700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_settings" ADD COLUMN "display_currency" varchar NOT NULL DEFAULT ('UZS')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_settings" DROP COLUMN "display_currency"`);
  }
}
