import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FT-163: the moment the first launch entered an account's opening balance (`opening_at`). On the opening day the
 * balance counts only what was written from that moment on: the amount entered already has what was spent before
 * it. Accounts that exist keep `opening_at` empty — their opening day counts whole, as before, so no balance changes.
 */
export class AccountOpeningAt1762600000000 implements MigrationInterface {
  name = 'AccountOpeningAt1762600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "accounts" ADD COLUMN "opening_at" datetime`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN "opening_at"`);
  }
}
