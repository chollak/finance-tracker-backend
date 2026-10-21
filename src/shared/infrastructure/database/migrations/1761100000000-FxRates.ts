import { MigrationInterface, QueryRunner } from 'typeorm';

/** FT-102: Central Bank USD rates by date. Rates are loaded at start and once a day. */
export class FxRates1761100000000 implements MigrationInterface {
  name = 'FxRates1761100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "fx_rates" ("date" date NOT NULL, "currency" varchar NOT NULL, "rate_minor" bigint NOT NULL, "source" varchar NOT NULL DEFAULT ('cbu'), "fetched_at" datetime NOT NULL, PRIMARY KEY ("date", "currency"))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "fx_rates"`);
  }
}
