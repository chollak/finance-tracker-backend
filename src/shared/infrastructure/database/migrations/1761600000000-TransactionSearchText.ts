import { MigrationInterface, QueryRunner } from 'typeorm';

/** `recordSearchText` as of this migration; copied so the migration does not change with the code. */
function searchTextOf(row: { description: string | null; merchant: string | null }): string {
  return [row.description, row.merchant].filter(Boolean).join(' ')
    .trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

/**
 * FT-107: `search_text` — note and merchant normalized for search («Такси» is found by «такси»). SQLite
 * cannot fold Cyrillic case, so existing records are filled in code, the same way new ones are written.
 */
export class TransactionSearchText1761600000000 implements MigrationInterface {
  name = 'TransactionSearchText1761600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" ADD COLUMN "search_text" varchar NOT NULL DEFAULT ('')`);
    const rows: Array<{ id: string; description: string | null; merchant: string | null }> = await queryRunner.query(
      `SELECT "id", "description", "merchant" FROM "transactions"`
    );
    for (const row of rows) {
      const text = searchTextOf(row);
      if (text) await queryRunner.query(`UPDATE "transactions" SET "search_text" = ? WHERE "id" = ?`, [text, row.id]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "search_text"`);
  }
}
